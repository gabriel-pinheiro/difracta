import {
  surfaceCanvasSize,
  type Catalog,
  type ParameterValues,
} from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import { reportIssue, type RenderIssue } from "./issues.ts";
import type { LayerDraw } from "./plan.ts";
import { resolveParameters } from "./sdk/parameters.ts";
import { createVisualPlayer, type VisualPlayer } from "./sdk/player.ts";
import { createShaderPlayer, type ShaderPlayer } from "./sdk/shader-player.ts";
import { isShaderVisual, type ShaderVisual } from "./sdk/shader-visual.ts";
import type { Uniforms } from "./sdk/uniforms.ts";
import { isCanvasVisual, type CanvasVisual } from "./sdk/visual.ts";

/** A Layer with something to composite this frame: a canvas texture or a shader to run. */
export type LayerFrame = {
  readonly draw: LayerDraw;
  /** Position in the plan, which is where Filter passes are placed. */
  readonly index: number;
} & (
  | { readonly kind: "canvas"; readonly texture: WebGLTexture }
  | {
      readonly kind: "shader";
      readonly visual: ShaderVisual;
      readonly params: ParameterValues;
      readonly uniforms: Uniforms;
      readonly width: number;
      readonly height: number;
    }
);

/** Layers in the plan, Layers with a runnable instance, Layers that drew anew. */
export interface Workload {
  readonly planned: number;
  readonly running: number;
  readonly rendered: number;
}

export interface StepReport {
  readonly frames: readonly LayerFrame[];
  /** True when any Layer's picture changed, so the frame must be recomposited. */
  readonly changed: boolean;
  readonly canvas: Workload;
  readonly shaders: Workload;
  /** The Layers whose instance failed, one issue each, on every frame they stay planned. */
  readonly issues: readonly RenderIssue[];
}

/**
 * A failed entry keeps its key and its place in the map, so its Visual is
 * retried exactly when a live entry would be replaced: the Layer leaves
 * the plan, or its Visual (or, for a canvas Visual, its canvas size)
 * changes.
 */
interface CanvasEntry {
  readonly kind: "canvas";
  readonly visual: string;
  readonly width: number;
  readonly height: number;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly player: VisualPlayer;
  readonly texture: WebGLTexture;
  blank: boolean;
  issue: RenderIssue | undefined;
}

interface ShaderEntry {
  readonly kind: "shader";
  readonly visual: string;
  readonly player: ShaderPlayer;
  issue: RenderIssue | undefined;
}

type Entry = CanvasEntry | ShaderEntry;

interface Counter {
  planned: number;
  running: number;
  rendered: number;
}

/**
 * The Visual instances of one Output, one per planned Layer. A canvas
 * Visual gets its own canvas and texture, uploaded on the frames it drew;
 * a shader Visual gets a player whose uniforms the compositor draws with.
 * An instance exists exactly while its Layer is in the plan: playing
 * another Scene, disabling the Layer, or losing its Target disposes it,
 * and a Visual or canvas-size change replaces it. Cues reach the instance
 * of the Layer they were fired on. An instance that throws is stopped by
 * its player; the Layer is logged once, draws nothing and is reported as
 * an issue on every frame until its entry is replaced.
 */
export class LayerPlayers {
  readonly #gl: WebGL2RenderingContext;
  readonly #catalog: Catalog;
  readonly #maxDimension: number;
  readonly #entries = new Map<string, Entry>();

  constructor(gl: WebGL2RenderingContext, catalog: Catalog) {
    this.#gl = gl;
    this.#catalog = catalog;
    this.#maxDimension = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }

  step(
    draws: readonly LayerDraw[],
    dt: number,
    outputWidth: number,
    outputHeight: number,
  ): StepReport {
    const frames: LayerFrame[] = [];
    const issues: RenderIssue[] = [];
    const seen = new Set<string>();
    let changed = false;
    const canvas: Counter = { planned: 0, running: 0, rendered: 0 };
    const shaders: Counter = { planned: 0, running: 0, rendered: 0 };
    draws.forEach((draw, index) => {
      const definition = this.#catalog.visual(draw.visual);
      if (definition === undefined) return;
      const counter = definition.backend === "canvas" ? canvas : shaders;
      counter.planned += 1;
      const size = (renderScale: number) =>
        surfaceCanvasSize({
          corners: draw.corners,
          outputWidth,
          outputHeight,
          size: draw.surface.size,
          renderScale,
          maxDimension: this.#maxDimension,
        });
      if (isCanvasVisual(definition)) {
        seen.add(draw.layer.id);
        const entry = this.#canvasEntry(
          draw,
          definition,
          size(draw.surface.renderScale),
        );
        if (entry.issue !== undefined) {
          issues.push(entry.issue);
          return;
        }
        counter.running += 1;
        const result = entry.player.frame(
          dt,
          draw.layer.parameters,
          draw.paths,
        );
        if (result.failure !== undefined)
          this.#fail(entry, draw, result.failure, issues);
        else if (result.rendered) {
          this.#upload(entry);
          counter.rendered += 1;
          changed = true;
        }
        if (result.blank !== entry.blank) changed = true;
        entry.blank = result.blank;
        if (!result.blank)
          frames.push({ kind: "canvas", draw, index, texture: entry.texture });
      } else if (isShaderVisual(definition)) {
        seen.add(draw.layer.id);
        const entry = this.#shaderEntry(draw, definition);
        if (entry.issue !== undefined) {
          issues.push(entry.issue);
          return;
        }
        counter.running += 1;
        const { width, height } = size(1);
        const result = entry.player.frame(
          dt,
          draw.layer.parameters,
          width,
          height,
          draw.paths,
        );
        if (result.changed) changed = true;
        if (result.failure !== undefined)
          this.#fail(entry, draw, result.failure, issues);
        if (result.blank) return;
        counter.rendered += 1;
        frames.push({
          kind: "shader",
          draw,
          index,
          visual: definition,
          params: resolveParameters(
            definition.parameters,
            draw.layer.parameters,
          ),
          uniforms: result.uniforms,
          width,
          height,
        });
      }
    });
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      this.#dispose(entry);
      this.#entries.delete(id);
      changed = true;
    }
    return { frames, changed, canvas, shaders, issues };
  }

  /** Delivers a Cue fired on a Layer to its instance, if it is running. */
  cue(layerId: string, key: string): void {
    this.#entries.get(layerId)?.player.cue(key);
  }

  dispose(): void {
    for (const entry of this.#entries.values()) this.#dispose(entry);
    this.#entries.clear();
  }

  #canvasEntry(
    draw: LayerDraw,
    definition: CanvasVisual,
    { width, height }: { readonly width: number; readonly height: number },
  ): CanvasEntry {
    const current = this.#entries.get(draw.layer.id);
    if (
      current?.kind === "canvas" &&
      current.visual === draw.visual &&
      current.width === width &&
      current.height === height
    )
      return current;
    if (current !== undefined) this.#dispose(current);
    const { canvas, context } = createScratchCanvas(width, height);
    const entry: CanvasEntry = {
      kind: "canvas",
      visual: draw.visual,
      width,
      height,
      canvas,
      player: createVisualPlayer(definition, {
        context: context as CanvasRenderingContext2D,
        width,
        height,
        seed: draw.layer.id,
      }),
      texture: createTexture(this.#gl),
      blank: false,
      issue: undefined,
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }

  /** The instance threw: logged once here, reported on every frame from now on. */
  #fail(
    entry: Entry,
    draw: LayerDraw,
    error: Error,
    issues: RenderIssue[],
  ): void {
    entry.issue = reportIssue("Visual", draw.layer, draw.visual, error);
    issues.push(entry.issue);
  }

  #shaderEntry(draw: LayerDraw, definition: ShaderVisual): ShaderEntry {
    const current = this.#entries.get(draw.layer.id);
    if (current?.kind === "shader" && current.visual === draw.visual)
      return current;
    if (current !== undefined) this.#dispose(current);
    const entry: ShaderEntry = {
      kind: "shader",
      visual: draw.visual,
      player: createShaderPlayer(definition, {
        width: 1,
        height: 1,
        seed: draw.layer.id,
      }),
      issue: undefined,
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }

  #upload(entry: CanvasEntry): void {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      entry.canvas,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  #dispose(entry: Entry): void {
    entry.player.dispose();
    if (entry.kind === "canvas") this.#gl.deleteTexture(entry.texture);
  }
}
