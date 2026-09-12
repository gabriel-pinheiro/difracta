import { settings, type Document } from "@difracta/core";
import {
  createCompositor,
  type Compositor,
  type FrameReport,
  type RenderIssue,
} from "@difracta/render";
import { builtInCatalog } from "@difracta/visuals";

/**
 * The Projection Frame: sizes the canvas to the display, runs the animation
 * loop and hands each frame to the compositor. The loop also measures
 * itself, cheaply: one timestamp per frame and two around the draw, folded
 * into rolling averages that the page reports once a second. Frames the
 * compositor skips (nothing changed) count as zero work, which is the truth.
 * A frame that throws is logged (once per distinct error, not per frame)
 * and the loop goes on: the next frame is requested whatever happened.
 * With nothing to draw (Blackout, or no document yet) the loop idles at
 * `settings.output.idleFrameMs` and a document update wakes it, so the
 * frame after a Blackout lands within one display frame.
 */
export interface FrameMetrics {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly frameIntervalMs: number | null;
  readonly renderWorkMs: number | null;
  /** Rolling average of Layers drawn per frame, and the plan's counts from the last frame. */
  readonly layers: {
    readonly renderedPerFrame: number;
    readonly running: number;
    readonly planned: number;
  };
  /** The same for shader Layers. */
  readonly shaders: {
    readonly renderedPerFrame: number;
    readonly running: number;
    readonly planned: number;
  };
  /** The same for Filter passes. */
  readonly filters: {
    readonly executedPerFrame: number;
    readonly running: number;
    readonly planned: number;
  };
  /** The Layers the last frame reported as unable to run. */
  readonly issues: readonly RenderIssue[];
}

/** Weight of the newest sample in the rolling averages. */
const SMOOTHING = 0.1;

export class FrameCanvas {
  readonly #canvas: HTMLCanvasElement;
  readonly #compositor: Compositor;
  #document: Document | undefined;
  #outputId = "";
  #limitPixelRatio = false;
  #animationFrame: number | undefined;
  /** The pause before the next tick while idling; cleared by `update` and `stop`. */
  #idleTimer: number | undefined;
  #lastFrameAt: number | undefined;
  #frameIntervalMs: number | null = null;
  #renderWorkMs: number | null = null;
  #pixelRatio = 1;
  #renderedPerFrame = 0;
  #shadersPerFrame = 0;
  #executedPerFrame = 0;
  #frameError: string | undefined;
  #lastReport: Pick<FrameReport, "layers" | "shaders" | "filters" | "issues"> =
    {
      layers: { planned: 0, running: 0, rendered: 0 },
      shaders: { planned: 0, running: 0, rendered: 0 },
      filters: { planned: 0, running: 0, executed: 0 },
      issues: [],
    };

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#compositor = createCompositor(canvas, builtInCatalog);
  }

  update(state: {
    readonly document: Document;
    readonly outputId: string;
  }): void {
    this.#document = state.document;
    this.#outputId = state.outputId;
    this.#limitPixelRatio =
      state.document.outputs[state.outputId]?.limitPixelRatio ?? false;
    if (this.#idleTimer === undefined) return;
    window.clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    this.#animationFrame = requestAnimationFrame(this.#tick);
  }

  metrics(): FrameMetrics {
    return {
      width: Math.max(1, this.#canvas.width),
      height: Math.max(1, this.#canvas.height),
      pixelRatio: this.#pixelRatio,
      frameIntervalMs: this.#frameIntervalMs,
      renderWorkMs: this.#renderWorkMs,
      layers: {
        renderedPerFrame: this.#renderedPerFrame,
        running: this.#lastReport.layers.running,
        planned: this.#lastReport.layers.planned,
      },
      shaders: {
        renderedPerFrame: this.#shadersPerFrame,
        running: this.#lastReport.shaders.running,
        planned: this.#lastReport.shaders.planned,
      },
      filters: {
        executedPerFrame: this.#executedPerFrame,
        running: this.#lastReport.filters.running,
        planned: this.#lastReport.filters.planned,
      },
      issues: this.#lastReport.issues,
    };
  }

  /** A Cue fired on a Layer; the next frame's update sees it. */
  trigger(layerId: string, key: string): void {
    this.#compositor.trigger(layerId, key);
  }

  start(): void {
    if (this.#animationFrame !== undefined || this.#idleTimer !== undefined)
      return;
    this.#animationFrame = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    if (this.#animationFrame !== undefined)
      cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    if (this.#idleTimer !== undefined) window.clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    this.#lastFrameAt = undefined;
    this.#frameIntervalMs = null;
    this.#renderWorkMs = null;
  }

  readonly #tick = (now: number): void => {
    this.#animationFrame = undefined;
    if (this.#lastFrameAt !== undefined)
      this.#frameIntervalMs = smooth(
        this.#frameIntervalMs,
        now - this.#lastFrameAt,
      );
    this.#lastFrameAt = now;
    const started = performance.now();
    const idle =
      this.#document === undefined || this.#document.operational.blackout;
    try {
      this.#draw(now);
      this.#frameError = undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.#frameError) console.error("Frame failed:", error);
      this.#frameError = message;
    } finally {
      this.#renderWorkMs = smooth(
        this.#renderWorkMs,
        performance.now() - started,
      );
      if (idle)
        this.#idleTimer = window.setTimeout(() => {
          this.#idleTimer = undefined;
          this.#animationFrame = requestAnimationFrame(this.#tick);
        }, settings.output.idleFrameMs);
      else this.#animationFrame = requestAnimationFrame(this.#tick);
    }
  };

  #draw(now: number): void {
    const ratio = this.#limitPixelRatio ? 1 : window.devicePixelRatio || 1;
    this.#pixelRatio = ratio;
    const width = Math.max(1, Math.round(this.#canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.#canvas.clientHeight * ratio));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    if (this.#document === undefined) return;
    const report = this.#compositor.render(
      this.#document,
      this.#outputId,
      width,
      height,
      now,
    );
    this.#lastReport = report;
    this.#renderedPerFrame = smooth(
      this.#renderedPerFrame,
      report.layers.rendered,
    );
    this.#shadersPerFrame = smooth(
      this.#shadersPerFrame,
      report.shaders.rendered,
    );
    this.#executedPerFrame = smooth(
      this.#executedPerFrame,
      report.filters.executed,
    );
  }
}

function smooth(average: number | null, sample: number): number {
  return average === null ? sample : average + SMOOTHING * (sample - average);
}
