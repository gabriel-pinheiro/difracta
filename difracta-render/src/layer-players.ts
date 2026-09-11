import { surfaceCanvasSize, type Catalog } from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import type { LayerDraw } from "./plan.ts";
import { createVisualPlayer, type VisualPlayer } from "./sdk/player.ts";
import { isCanvasVisual, type CanvasVisual } from "./sdk/visual.ts";

/** A Layer whose canvas holds something to composite this frame. */
export interface LayerFrame {
  readonly draw: LayerDraw;
  readonly texture: WebGLTexture;
}

export interface StepReport {
  readonly frames: readonly LayerFrame[];
  /** True when any Layer's canvas changed, so the frame must be recomposited. */
  readonly changed: boolean;
  /** Layers in the plan, Layers with a runnable instance, Layers that drew. */
  readonly planned: number;
  readonly running: number;
  readonly rendered: number;
}

interface Entry {
  readonly visual: string;
  readonly width: number;
  readonly height: number;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly player: VisualPlayer;
  readonly texture: WebGLTexture;
  blank: boolean;
}

/**
 * The Visual instances of one Output, one per planned Layer, each on its
 * own canvas and texture. An instance exists exactly while its Layer is in
 * the plan: playing another Scene, disabling the Layer, or losing its
 * Target disposes it, and a Visual or canvas-size change replaces it. The
 * texture is uploaded only on frames the instance drew.
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
    const seen = new Set<string>();
    let changed = false;
    let running = 0;
    let rendered = 0;
    for (const draw of draws) {
      const definition = this.#catalog.visual(draw.visual);
      if (definition === undefined || !isCanvasVisual(definition)) continue;
      seen.add(draw.layer.id);
      const entry = this.#entry(draw, definition, outputWidth, outputHeight);
      running += 1;
      const result = entry.player.frame(dt, draw.layer.parameters);
      if (result.rendered) {
        this.#upload(entry);
        rendered += 1;
        changed = true;
      }
      if (result.blank !== entry.blank) changed = true;
      entry.blank = result.blank;
      if (!result.blank) frames.push({ draw, texture: entry.texture });
    }
    for (const [id, entry] of this.#entries) {
      if (seen.has(id)) continue;
      this.#dispose(entry);
      this.#entries.delete(id);
      changed = true;
    }
    return { frames, changed, planned: draws.length, running, rendered };
  }

  dispose(): void {
    for (const entry of this.#entries.values()) this.#dispose(entry);
    this.#entries.clear();
  }

  #entry(
    draw: LayerDraw,
    definition: CanvasVisual,
    outputWidth: number,
    outputHeight: number,
  ): Entry {
    const { width, height } = surfaceCanvasSize({
      corners: draw.corners,
      outputWidth,
      outputHeight,
      size: draw.surface.size,
      renderScale: draw.surface.renderScale,
      maxDimension: this.#maxDimension,
    });
    const current = this.#entries.get(draw.layer.id);
    if (
      current?.visual === draw.visual &&
      current.width === width &&
      current.height === height
    )
      return current;
    if (current !== undefined) this.#dispose(current);
    const { canvas, context } = createScratchCanvas(width, height);
    const entry: Entry = {
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
    };
    this.#entries.set(draw.layer.id, entry);
    return entry;
  }

  #upload(entry: Entry): void {
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
    this.#gl.deleteTexture(entry.texture);
  }
}
