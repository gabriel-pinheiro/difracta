import { effectiveDocument, type Catalog, type Document } from "@difracta/core";

import { CalibrationDrawing } from "./calibration-drawing.ts";
import { FilterChain } from "./filter-chain.ts";
import {
  FilterPlayers,
  passesWithInput,
  type RootFilterPass,
} from "./filter-players.ts";
import { FilterPrograms } from "./filter-programs.ts";
import {
  NO_FILTERS,
  NO_ISSUES,
  NO_LAYERS,
  type FrameReport,
} from "./frame-report.ts";
import { frameIssues } from "./issues.ts";
import { drawShader, drawTexture, plannedMedia } from "./layer-composite.ts";
import { LayerChain, targetBufferSize } from "./layer-chain.ts";
import { LayerPlayers } from "./layer-players.ts";
import { MaskTextures } from "./masks.ts";
import { FontLoader } from "./font-loader.ts";
import { EngineMedia } from "./engine-media.ts";
import type { PacksView } from "./pack-sources.ts";
import type { ShareSignalling } from "./live-peer.ts";
import type { LiveSource } from "./shared-viewer.ts";
import { MediaTextures } from "./media-textures.ts";
import { TextRasters } from "./text-rasters.ts";
import { planFrame, plannedSurfaces } from "./plan.ts";
import { MAX_FRAME_SECONDS } from "./sdk/visual.ts";
import { ShaderVisualPrograms } from "./shader-visuals.ts";
import { SurfaceGeometries } from "./surface-geometry.ts";
import { SurfaceProgram } from "./surface-program.ts";

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
  /**
   * The `packs` live state as the page has it: which Pack entries exist,
   * their files, types, fingerprints and beats. The next `render` loads
   * the entries the document names from it; until the first call nothing
   * loads.
   */
  setPacks(packs: PacksView): void;
  dispose(): void;
}

export interface CompositorOptions {
  /**
   * Where a Media reference's file is fetched from:
   * `/packs/<packId>/<entryId>` on the runtime for an Output page, a data
   * URL for the thumbnail harness; undefined for one this page cannot
   * reach. Without it no Media loads and every Media handle stays empty.
   */
  readonly mediaUrl?: (reference: string) => string | undefined;
  /**
   * Where a Bundled Font's file is fetched from, by file name:
   * `/fonts/<file>` on the runtime for an Output page. Without it no font
   * loads and every text Layer stays blank.
   */
  readonly fontUrl?: (file: string) => string | undefined;
  /**
   * How this page views Screen Shares: `client.viewing` for an Output page.
   * Without it nothing is viewed and every Screen Share stays empty.
   */
  readonly shares?: ShareSignalling;
  /**
   * A claim on the page's one Viewer (`SharedViewer`), for a page where
   * other places view the same shares, as in Studio; it takes the place of
   * `shares`, and disposing the compositor disposes the claim.
   */
  readonly viewer?: LiveSource;
}

interface Resources {
  readonly gl: WebGL2RenderingContext;
  readonly program: SurfaceProgram;
  readonly calibration: CalibrationDrawing;
  readonly masks: MaskTextures;
  readonly players: LayerPlayers;
  readonly filters: FilterPlayers;
  readonly filterPrograms: FilterPrograms;
  readonly chain: FilterChain;
  readonly layerChain: LayerChain;
  readonly shaderPrograms: ShaderVisualPrograms;
  readonly maxDimension: number;
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
 * Media (`engine-media.ts`) is kept outside the GPU resources: elements and
 * peer connections survive a lost context, textures do not.
 */
class WebGLCompositor implements Compositor {
  readonly #canvas: HTMLCanvasElement;
  readonly #catalog: Catalog;
  readonly #media: EngineMedia;
  readonly #text: TextRasters;
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
    this.#media = new EngineMedia({
      catalog,
      mediaUrl: options.mediaUrl ?? (() => undefined),
      shares: options.shares,
      viewer: options.viewer,
    });
    this.#text = new TextRasters(
      new FontLoader({
        catalog,
        fontUrl: options.fontUrl ?? (() => undefined),
      }),
    );
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
        videos: { layers: 0, ...this.#media.videos() },
        shares: this.#media.shares(),
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
    this.#media.sync(document, outputId);
    // Parameter Links resolve here, once per frame: the Layers planned and
    // drawn carry what their Controllers make of them.
    const plan = planFrame(
      effectiveDocument(document, this.#catalog),
      outputId,
      this.#catalog,
    );
    this.#media.preload(() => plannedMedia(plan.layers, this.#catalog));
    const step = resources.players.step(plan.layers, dt, width, height);
    resources.media.retain(step.textures);
    this.#text.retain(step.textures);
    const chain = resources.filters.step(
      plan.filters,
      plan.layers,
      dt,
      width,
      height,
      (draw) => targetBufferSize(draw, width, height, resources.maxDimension),
    );
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
    const videos = { layers: step.videoLayers, ...this.#media.videos() };
    const shares = this.#media.shares();
    const issues = frameIssues(
      step,
      chain,
      (id) => resources.shaderPrograms.failure(id),
      (id) => resources.filterPrograms.failure(id),
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
        videos,
        shares,
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
    if (plan.blackout)
      return { drew: true, layers, shaders, filters, videos, shares, issues };

    // With a Filter to run, the Layers accumulate in the chain's target
    // instead of the screen, each pass transforms what is there so far,
    // and the last target is presented.
    const filtered = passes.length > 0;
    if (filtered) resources.chain.begin(width, height);
    program.use();
    let next = 0;
    const passesBelow = (count: number): void => {
      for (;;) {
        const pass: RootFilterPass | undefined = passes[next];
        if (pass === undefined || pass.draw.below > count) return;
        resources.chain.apply(pass);
        program.use();
        next += 1;
      }
    };
    let executed = passes.length;
    for (const frame of step.frames) {
      passesBelow(frame.index);
      // A Layer with Filters of its own runs them over its picture first,
      // in its Target, and composites the result like a canvas; then the
      // frame's target is bound again, since the chain drew elsewhere.
      const nested = chain.nested.get(frame.draw.layer.id);
      let treated: WebGLTexture | undefined;
      if (nested !== undefined && nested.passes.length > 0) {
        const result = resources.layerChain.run(
          frame,
          nested,
          targetBufferSize(frame.draw, width, height, resources.maxDimension),
          frame.fresh,
        );
        treated = result.texture;
        executed += result.executed;
        if (filtered) resources.chain.resume();
        else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, width, height);
        }
        program.use();
      }
      const geometry = resources.geometries.get(
        frame.draw.target,
        frame.draw.corners,
        width,
        height,
      );
      if (geometry === undefined) continue;
      program.setSurface(geometry);
      const maskTexture = resources.masks.get(
        { ...frame.draw, corners: frame.draw.surfaceCorners },
        width,
        height,
      );
      if (treated !== undefined)
        drawTexture(resources, frame.draw, treated, maskTexture, true);
      else if (frame.kind === "canvas")
        drawTexture(resources, frame.draw, frame.texture, maskTexture);
      else if (frame.buffer !== undefined)
        drawTexture(resources, frame.draw, frame.buffer.texture, maskTexture);
      else drawShader(resources, frame, geometry.matrix, maskTexture);
    }
    passesBelow(plan.layers.length);
    if (filtered) {
      resources.chain.present();
      program.use();
    }
    for (const draw of plan.draws) {
      const geometry = resources.geometries.get(
        draw.surface.id,
        draw.corners,
        width,
        height,
      );
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
    // hidden or blank this frame keeps its Masks rasterized, and a filtered
    // Layer keeps its result while it is planned, hidden or blank too.
    resources.masks.retain(plannedSurfaces(plan));
    resources.layerChain.retain(
      new Set(
        plan.layers
          .filter((draw) => draw.filters.length > 0)
          .map((draw) => draw.layer.id),
      ),
    );
    return {
      drew: true,
      layers,
      shaders,
      filters: { ...filters, executed },
      videos,
      shares,
      issues,
    };
  }

  trigger(layerId: string, key: string): void {
    this.#resources?.players.cue(layerId, key);
  }

  setPacks(packs: PacksView): void {
    this.#media.setPacks(packs);
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
    resources.layerChain.dispose();
    resources.chain.dispose();
    resources.filterPrograms.dispose();
    resources.shaderPrograms.dispose();
    resources.media.dispose();
    resources.program.dispose();
    this.#resources = undefined;
    this.#media.dispose();
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
    const filterPrograms = new FilterPrograms(gl, program.quad);
    const shaderPrograms = new ShaderVisualPrograms(
      gl,
      program.surface,
      program.quad,
      media,
    );
    return {
      gl,
      program,
      calibration: new CalibrationDrawing(program),
      masks: new MaskTextures(gl),
      players: new LayerPlayers(gl, this.#catalog, this.#media, this.#text),
      filters: new FilterPlayers(this.#catalog),
      filterPrograms,
      chain: new FilterChain(gl, filterPrograms),
      layerChain: new LayerChain(gl, filterPrograms, shaderPrograms),
      shaderPrograms,
      media,
      geometries: new SurfaceGeometries(),
      maxDimension: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    };
  }
}
