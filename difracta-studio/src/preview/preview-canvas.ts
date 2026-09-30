import { settings } from "@difracta/core";
import {
  createCompositor,
  type Compositor,
  type CompositorOptions,
  type ViewerClaim,
} from "@difracta/render";
import { builtInCatalog } from "@difracta/visuals";

import type { PreviewFrame } from "./preview-document";

export interface PreviewCanvasOptions extends Omit<
  CompositorOptions,
  "viewer"
> {
  /** The Preview's claim on the page's Viewer; the canvas disposes it. */
  readonly viewer: ViewerClaim;
  /** Told what stops the frames from drawing, and `undefined` once they draw again. */
  readonly onProblem: (message: string | undefined) => void;
}

/**
 * The Preview's canvas: a compositor of its own, with its own Visual
 * Instances, and the animation loop that feeds it. The canvas takes the size
 * it is shown at, in device pixels, once that size has stopped changing for
 * `settings.preview.resizeSettleMs`; until then the frame it holds is
 * stretched, since rendering at another size starts every Visual again. The
 * loop runs only while the Preview is active and the page is visible. The
 * compositor is made by the first frame, so a display without WebGL2 is a
 * problem reported like any other. Screen Shares come through a claim on
 * the page's Viewer, which wants nothing while the loop is stopped, so a
 * Preview nobody looks at views no share.
 */
export class PreviewCanvas {
  readonly #canvas: HTMLCanvasElement;
  readonly #options: CompositorOptions;
  readonly #viewer: ViewerClaim;
  /** `null` once making it failed: the display will not change its mind. */
  #compositor: Compositor | null | undefined;
  readonly #observer: ResizeObserver;
  readonly #onProblem: (message: string | undefined) => void;
  #frame: PreviewFrame | undefined;
  #active = false;
  #sized = false;
  #animationFrame: number | undefined;
  #settleTimer: number | undefined;
  #problem: string | undefined;

  constructor(canvas: HTMLCanvasElement, options: PreviewCanvasOptions) {
    const { onProblem, ...compositor } = options;
    this.#canvas = canvas;
    this.#onProblem = onProblem;
    this.#options = compositor;
    this.#viewer = compositor.viewer;
    this.#observer = new ResizeObserver(() => this.#resized());
    this.#observer.observe(canvas);
    document.addEventListener("visibilitychange", this.#run);
  }

  /** What the next frames render; `undefined` leaves the canvas as it is. */
  show(frame: PreviewFrame | undefined): void {
    this.#frame = frame;
  }

  /** A Cue fired on a Layer; the next frame's update sees it. */
  trigger(layerId: string, key: string): void {
    this.#compositor?.trigger(layerId, key);
  }

  setActive(active: boolean): void {
    this.#active = active;
    this.#run();
  }

  dispose(): void {
    this.#active = false;
    this.#run();
    document.removeEventListener("visibilitychange", this.#run);
    this.#observer.disconnect();
    window.clearTimeout(this.#settleTimer);
    this.#compositor?.dispose();
    this.#viewer.dispose();
  }

  /** Starts or stops the loop to match what is wanted now. */
  readonly #run = (): void => {
    const wanted = this.#active && document.visibilityState === "visible";
    if (wanted && this.#animationFrame === undefined)
      this.#animationFrame = requestAnimationFrame(this.#tick);
    if (!wanted && this.#animationFrame !== undefined) {
      cancelAnimationFrame(this.#animationFrame);
      this.#animationFrame = undefined;
      this.#viewer.pause();
    }
  };

  readonly #tick = (now: number): void => {
    this.#animationFrame = requestAnimationFrame(this.#tick);
    if (this.#frame === undefined || !this.#sized) return;
    if (this.#compositor === null) return;
    try {
      this.#compositor ??= this.#create();
      this.#compositor.render(
        this.#frame.document,
        this.#frame.outputId,
        this.#canvas.width,
        this.#canvas.height,
        now,
      );
      this.#report(undefined);
    } catch (error: unknown) {
      this.#report(error instanceof Error ? error.message : String(error));
    }
  };

  #create(): Compositor {
    try {
      return createCompositor(this.#canvas, builtInCatalog, this.#options);
    } catch (error: unknown) {
      this.#compositor = null;
      throw error;
    }
  }

  /** Once per distinct problem, not once per frame. */
  #report(problem: string | undefined): void {
    if (problem === this.#problem) return;
    this.#problem = problem;
    if (problem !== undefined) console.error("Preview frame failed:", problem);
    this.#onProblem(problem);
  }

  #resized(): void {
    window.clearTimeout(this.#settleTimer);
    this.#settleTimer = undefined;
    const size = this.#shownSize();
    // Hidden, or not laid out yet: there is no size to take.
    if (size === undefined) return;
    if (!this.#sized) this.#resize(size);
    else if (
      size.width !== this.#canvas.width ||
      size.height !== this.#canvas.height
    )
      this.#settleTimer = window.setTimeout(() => {
        this.#settleTimer = undefined;
        const settled = this.#shownSize();
        if (settled !== undefined) this.#resize(settled);
      }, settings.preview.resizeSettleMs);
  }

  #shownSize():
    { readonly width: number; readonly height: number } | undefined {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(this.#canvas.clientWidth * ratio);
    const height = Math.round(this.#canvas.clientHeight * ratio);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }

  #resize(size: { readonly width: number; readonly height: number }): void {
    this.#canvas.width = size.width;
    this.#canvas.height = size.height;
    this.#sized = true;
  }
}
