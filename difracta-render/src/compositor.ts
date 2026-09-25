import { effectiveDocument, type Catalog, type Document } from "@difracta/core";

import { CalibrationDrawing } from "./calibration-drawing.ts";
import { FilterChain } from "./filter-chain.ts";
import {
  FilterPlayers,
  passesWithInput,
  type FilterPass,
} from "./filter-players.ts";
import { frameIssues, type RenderIssue } from "./issues.ts";
import { LayerPlayers, type LayerFrame } from "./layer-players.ts";
import { MaskTextures } from "./masks.ts";
import { MediaLoader } from "./media-loader.ts";
import { MediaTextures } from "./media-textures.ts";
import { planFrame, plannedSurfaces, type LayerDraw } from "./plan.ts";
import { MAX_FRAME_SECONDS } from "./sdk/visual.ts";
import { ShaderVisualPrograms } from "./shader-visuals.ts";
import { SurfaceGeometries } from "./surface-geometry.ts";
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

export interface CompositorOptions {
  /**
   * Where a Media item's file is fetched from, by id: `/media/<id>` on the
   * runtime for an Output page, a data URL for the thumbnail harness.
   * Without it no Media loads and every Media handle stays empty.
   */
  readonly mediaUrl?: (id: string) => string | undefined;
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
  readonly media: MediaTextures;
  readonly geometries: SurfaceGeometries;
}

export function createCompositor(
  canvas: HTMLCanvasElement,
  catalog: Catalog,
  options: CompositorOptions = {},
): Compositor {
  return new WebGLCompositor(canvas, catalog, options);
}

/**
 * WebGL2 compositor for one Output. It keeps GPU resources per Surface
 * (mask texture, homography) and per Layer (instance, canvas, texture), and
 * skips frames whose inputs did not change and whose Layers drew nothing
 * new, so a static Scene costs the Output only the instances' updates. The
 * Media loader is kept outside the GPU resources: elements survive a lost
 * context, textures do not.
 */
class WebGLCompositor implements Compositor {
  readonly #canvas: HTMLCanvasElement;
  readonly #catalog: Catalog;
  readonly #loader: MediaLoader;
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

  constructor(
    canvas: HTMLCanvasElement,
    catalog: Catalog,
    options: CompositorOptions,
  ) {
    this.#canvas = canvas;
    this.#catalog = catalog;
    this.#loader = new MediaLoader({
      mediaUrl: options.mediaUrl ?? (() => undefined),
    });
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
    this.#loader.sync(document.media);
    // Parameter Links resolve here, once per frame: the Layers planned and
    // drawn carry what their Controllers make of them.
    const plan = planFrame(
      effectiveDocument(document, this.#catalog),
      outputId,
      this.#catalog,
    );
    const step = resources.players.step(plan.layers, dt, width, height);
    resources.media.retain(step.textures);
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
    // Shader Layers below full resolution render into their buffers first,
    // on the frames they changed, and are composited like canvases below.
    for (const frame of step.frames)
      if (frame.kind === "shader" && frame.buffer?.redraw === true)
        resources.shaderPrograms.render(frame.buffer, {
          visual: frame.visual,
          params: frame.params,
          uniforms: frame.uniforms,
          textures: frame.textures,
          paths: frame.draw.paths,
        });
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
      const geometry = resources.geometries.get(frame.draw, width, height);
      if (geometry === undefined) continue;
      program.setSurface(geometry);
      const maskTexture = resources.masks.get(frame.draw, width, height);
      if (frame.kind === "canvas")
        this.#drawTexture(resources, frame.draw, frame.texture, maskTexture);
      else if (frame.buffer !== undefined)
        this.#drawTexture(
          resources,
          frame.draw,
          frame.buffer.texture,
          maskTexture,
        );
      else this.#drawShader(resources, frame, geometry.matrix, maskTexture);
    }
    passesBelow(plan.layers.length);
    if (filtered) {
      resources.chain.present();
      program.use();
    }
    for (const draw of plan.draws) {
      const geometry = resources.geometries.get(draw, width, height);
      if (geometry === undefined) continue;
      program.setSurface(geometry);
      const maskTexture = resources.masks.get(draw, width, height);
      resources.calibration.draw(
        draw,
        maskTexture,
        geometry.matrix,
        width,
        height,
      );
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
    resources.media.dispose();
    resources.program.dispose();
    this.#resources = undefined;
    this.#loader.dispose();
  }

  #setup(): Resources {
    // No multisampling: Surface edges are feathered by the fragment
    // programs (`edgeCoverage` in `shaders.ts`), which the Filter chain's
    // textures need anyway, and a resolve per frame is spared.
    const gl = this.#canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
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
    const media = new MediaTextures(gl);
    return {
      gl,
      program,
      calibration: new CalibrationDrawing(program),
      masks: new MaskTextures(gl),
      players: new LayerPlayers(gl, this.#catalog, this.#loader),
      filters: new FilterPlayers(this.#catalog),
      chain: new FilterChain(gl, program.quad),
      shaderPrograms: new ShaderVisualPrograms(
        gl,
        program.surface,
        program.quad,
        media,
      ),
      media,
      geometries: new SurfaceGeometries(),
    };
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
      textures: frame.textures,
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

  /** A Layer's canvas or shader buffer over its Surface, with opacity, blend mode and the Surface's Masks. */
  #drawTexture(
    resources: Resources,
    draw: LayerDraw,
    texture: WebGLTexture,
    maskTexture: WebGLTexture | undefined,
  ): void {
    const { gl, program } = resources;
    const { uniforms } = program;
    const { layer } = draw;
    program.setMask(maskTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.mode, MODE.layer);
    gl.uniform4f(uniforms.color, 1, 1, 1, layer.opacity);
    gl.uniform4f(uniforms.rect, ...WHOLE);
    if (layer.blendMode === "additive") gl.blendFunc(gl.ONE, gl.ONE);
    program.drawSurface();
    if (layer.blendMode === "additive")
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
