import {
  effectiveDocument,
  type Catalog,
  type Document,
  type Quad,
} from "@difracta/core";

import { CalibrationDrawing } from "./calibration-drawing.ts";
import { FilterChain } from "./filter-chain.ts";
import {
  FilterPlayers,
  passesWithInput,
  type FilterPass,
} from "./filter-players.ts";
import { homography } from "./homography.ts";
import { frameIssues, type RenderIssue } from "./issues.ts";
import { LayerPlayers, type LayerFrame } from "./layer-players.ts";
import { MaskTextures } from "./masks.ts";
import { planFrame, plannedSurfaces, type SurfaceDraw } from "./plan.ts";
import { MAX_FRAME_SECONDS } from "./sdk/visual.ts";
import { ShaderVisualPrograms } from "./shader-visuals.ts";
import { MODE, SurfaceProgram, WHOLE } from "./surface-program.ts";

export interface Compositor {
  /**
   * Advances the Output's Visual instances to `now` (milliseconds, as the
   * animation loop gives it) and draws the frame for `document` into a
   * canvas of the given backing size, unless nothing changed since the
   * previous call. The caller owns the animation loop and the canvas size.
   */
  render(
    document: Document,
    outputId: string,
    width: number,
    height: number,
    now: number,
  ): FrameReport;
  /** Delivers a Cue fired on a Layer to that Layer's Visual instance. */
  trigger(layerId: string, key: string): void;
  dispose(): void;
}

export interface FrameReport {
  /** The canvas holds a new frame. */
  readonly drew: boolean;
  /** Canvas Layers in the plan (hidden ones included), with a running instance, and that drew this frame. */
  readonly layers: {
    readonly planned: number;
    readonly running: number;
    readonly rendered: number;
  };
  /** The same for shader Layers; rendered counts the ones drawn. */
  readonly shaders: {
    readonly planned: number;
    readonly running: number;
    readonly rendered: number;
  };
  /** Filters in the plan, with a running instance, and whose pass ran this frame. */
  readonly filters: {
    readonly planned: number;
    readonly running: number;
    readonly executed: number;
  };
  /** Planned Layers drawing nothing because their Visual or Filter cannot run. */
  readonly issues: readonly RenderIssue[];
}

const NO_LAYERS = { planned: 0, running: 0, rendered: 0 } as const;
const NO_FILTERS = { planned: 0, running: 0, executed: 0 } as const;
const NO_ISSUES: readonly RenderIssue[] = [];

interface Resources {
  readonly gl: WebGL2RenderingContext;
  readonly program: SurfaceProgram;
  readonly calibration: CalibrationDrawing;
  readonly masks: MaskTextures;
  readonly players: LayerPlayers;
  readonly filters: FilterPlayers;
  readonly chain: FilterChain;
  readonly shaderPrograms: ShaderVisualPrograms;
  /** Homographies by Surface, valid while the mapping's corners object is the same. */
  readonly matrices: Map<string, { corners: Quad; matrix: Float32Array }>;
}

export function createCompositor(
  canvas: HTMLCanvasElement,
  catalog: Catalog,
): Compositor {
  return new WebGLCompositor(canvas, catalog);
}

/**
 * WebGL2 compositor for one Output. It keeps GPU resources per Surface
 * (mask texture, homography) and per Layer (instance, canvas, texture), and
 * skips frames whose inputs did not change and whose Layers drew nothing
 * new, so a static Scene costs the Output only the instances' updates.
 */
class WebGLCompositor implements Compositor {
  readonly #canvas: HTMLCanvasElement;
  readonly #catalog: Catalog;
  #resources: Resources | undefined;
  #lost = false;
  #lastNow: number | undefined;
  #last:
    | {
        document: Document;
        outputId: string;
        width: number;
        height: number;
      }
    | undefined;
  readonly #onLost = (event: Event): void => {
    event.preventDefault();
    this.#lost = true;
    this.#resources = undefined;
  };
  readonly #onRestored = (): void => {
    this.#lost = false;
    this.#last = undefined;
  };

  constructor(canvas: HTMLCanvasElement, catalog: Catalog) {
    this.#canvas = canvas;
    this.#catalog = catalog;
    canvas.addEventListener("webglcontextlost", this.#onLost);
    canvas.addEventListener("webglcontextrestored", this.#onRestored);
    this.#resources = this.#setup();
  }

  render(
    document: Document,
    outputId: string,
    width: number,
    height: number,
    now: number,
  ): FrameReport {
    if (this.#lost)
      return {
        drew: false,
        layers: NO_LAYERS,
        shaders: NO_LAYERS,
        filters: NO_FILTERS,
        issues: NO_ISSUES,
      };
    const dt =
      this.#lastNow === undefined
        ? 0
        : Math.min(
            MAX_FRAME_SECONDS,
            Math.max(0, (now - this.#lastNow) / 1000),
          );
    this.#lastNow = now;
    const resources = (this.#resources ??= this.#setup());
    const { gl, program } = resources;
    // Parameter Links resolve here, once per frame: the Layers planned and
    // drawn carry what their Controllers make of them.
    const plan = planFrame(
      effectiveDocument(document, this.#catalog),
      outputId,
      this.#catalog,
    );
    const step = resources.players.step(plan.layers, dt, width, height);
    const chain = resources.filters.step(plan.filters, dt, width, height);
    // A pass over Layers that all drew nothing this frame would transform
    // a blank frame at full-frame cost, so only passes with input run.
    const passes = passesWithInput(chain.passes, step.frames);
    const layers = step.canvas;
    const shaders = step.shaders;
    const filters = {
      planned: chain.planned,
      running: chain.running,
      executed: passes.length,
    };
    const issues = frameIssues(
      step,
      chain,
      (id) => resources.shaderPrograms.failure(id),
      (id) => resources.chain.failure(id),
    );
    const last = this.#last;
    if (
      !step.changed &&
      !chain.changed &&
      last?.document === document &&
      last.outputId === outputId &&
      last.width === width &&
      last.height === height
    )
      return {
        drew: false,
        layers,
        shaders: { ...shaders, rendered: 0 },
        filters: { ...filters, executed: 0 },
        issues,
      };
    this.#last = { document, outputId, width, height };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (plan.blackout) return { drew: true, layers, shaders, filters, issues };

    // With a Filter to run, the Layers accumulate in the chain's target
    // instead of the screen, each pass transforms what is there so far,
    // and the last target is presented.
    const filtered = passes.length > 0;
    if (filtered) resources.chain.begin(width, height);
    program.use();
    let next = 0;
    const passesBelow = (count: number): void => {
      for (;;) {
        const pass: FilterPass | undefined = passes[next];
        if (pass === undefined || pass.draw.below > count) return;
        resources.chain.apply(pass);
        program.use();
        next += 1;
      }
    };
    for (const frame of step.frames) {
      passesBelow(frame.index);
      const matrix = this.#matrix(resources, frame.draw);
      if (matrix === undefined) continue;
      program.setHomography(matrix);
      const maskTexture = resources.masks.get(
        frame.draw.surface.id,
        frame.draw.masks,
      );
      if (frame.kind === "canvas")
        this.#drawLayer(resources, frame, maskTexture);
      else this.#drawShader(resources, frame, matrix, maskTexture);
    }
    passesBelow(plan.layers.length);
    if (filtered) {
      resources.chain.present();
      program.use();
    }
    for (const draw of plan.draws) {
      const matrix = this.#matrix(resources, draw);
      if (matrix === undefined) continue;
      program.setHomography(matrix);
      const maskTexture = resources.masks.get(draw.surface.id, draw.masks);
      resources.calibration.draw(draw, maskTexture, matrix, width, height);
    }
    // Mask textures follow the plan, not the draw: a Surface whose Layer is
    // hidden or blank this frame keeps its Masks rasterized.
    resources.masks.retain(plannedSurfaces(plan));
    return { drew: true, layers, shaders, filters, issues };
  }

  trigger(layerId: string, key: string): void {
    this.#resources?.players.cue(layerId, key);
  }

  dispose(): void {
    this.#canvas.removeEventListener("webglcontextlost", this.#onLost);
    this.#canvas.removeEventListener("webglcontextrestored", this.#onRestored);
    const resources = this.#resources;
    if (resources === undefined) return;
    resources.masks.dispose();
    resources.calibration.dispose();
    resources.players.dispose();
    resources.filters.dispose();
    resources.chain.dispose();
    resources.shaderPrograms.dispose();
    resources.program.dispose();
    this.#resources = undefined;
  }

  #setup(): Resources {
    const gl = this.#canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (gl === null) throw new Error("WebGL2 is unavailable on this display.");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(gl.createVertexArray());
    gl.enableVertexAttribArray(0);
    const program = new SurfaceProgram(gl);
    return {
      gl,
      program,
      calibration: new CalibrationDrawing(program),
      masks: new MaskTextures(gl),
      players: new LayerPlayers(gl, this.#catalog),
      filters: new FilterPlayers(this.#catalog),
      chain: new FilterChain(gl, program.quad),
      shaderPrograms: new ShaderVisualPrograms(gl, program.quad),
      matrices: new Map(),
    };
  }

  #matrix(
    resources: Resources,
    draw: Pick<SurfaceDraw, "surface" | "corners">,
  ): Float32Array | undefined {
    const cached = resources.matrices.get(draw.surface.id);
    if (cached?.corners === draw.corners) return cached.matrix;
    const matrix = homography(draw.corners);
    if (matrix === undefined) {
      resources.matrices.delete(draw.surface.id);
      return undefined;
    }
    resources.matrices.set(draw.surface.id, { corners: draw.corners, matrix });
    return matrix;
  }

  /** A shader Layer run over its Surface, with opacity, blend mode and the Surface's Masks. */
  #drawShader(
    resources: Resources,
    frame: LayerFrame & { kind: "shader" },
    homography: Float32Array,
    maskTexture: WebGLTexture | undefined,
  ): void {
    const { gl } = resources;
    const { layer } = frame.draw;
    if (layer.blendMode === "additive") gl.blendFunc(gl.ONE, gl.ONE);
    resources.shaderPrograms.draw({
      visual: frame.visual,
      params: frame.params,
      uniforms: frame.uniforms,
      paths: frame.draw.paths,
      width: frame.width,
      height: frame.height,
      opacity: layer.opacity,
      homography,
      maskTexture,
    });
    if (layer.blendMode === "additive")
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    resources.program.use();
  }

  /** A Layer's canvas over its Surface, with opacity, blend mode and the Surface's Masks. */
  #drawLayer(
    resources: Resources,
    frame: LayerFrame & { kind: "canvas" },
    maskTexture: WebGLTexture | undefined,
  ): void {
    const { gl, program } = resources;
    const { uniforms } = program;
    const { layer } = frame.draw;
    program.setMask(maskTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.uniform1i(uniforms.mode, MODE.layer);
    gl.uniform4f(uniforms.color, 1, 1, 1, layer.opacity);
    gl.uniform4f(uniforms.rect, ...WHOLE);
    if (layer.blendMode === "additive") gl.blendFunc(gl.ONE, gl.ONE);
    program.drawQuad();
    if (layer.blendMode === "additive")
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
