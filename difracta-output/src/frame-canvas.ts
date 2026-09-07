/**
 * Placeholder Projection Frame: black in Blackout, otherwise a dim field with
 * the Output's label. The renderer replaces the body of `draw`. The loop also
 * measures itself, cheaply: one timestamp per frame and two around the draw,
 * folded into rolling averages that the page reports once a second.
 */
export interface FrameMetrics {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly frameIntervalMs: number | null;
  readonly renderWorkMs: number | null;
}

/** Weight of the newest sample in the rolling averages. */
const SMOOTHING = 0.1;

export class FrameCanvas {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #blackout = false;
  #limitPixelRatio = false;
  #label = "";
  #animationFrame: number | undefined;
  #lastFrameAt: number | undefined;
  #frameIntervalMs: number | null = null;
  #renderWorkMs: number | null = null;
  #pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas 2D is unavailable.");
    this.#context = context;
  }

  update(state: {
    readonly blackout: boolean;
    readonly limitPixelRatio: boolean;
    readonly label: string;
  }): void {
    this.#blackout = state.blackout;
    this.#limitPixelRatio = state.limitPixelRatio;
    this.#label = state.label;
  }

  metrics(): FrameMetrics {
    return {
      width: Math.max(1, this.#canvas.width),
      height: Math.max(1, this.#canvas.height),
      pixelRatio: this.#pixelRatio,
      frameIntervalMs: this.#frameIntervalMs,
      renderWorkMs: this.#renderWorkMs,
    };
  }

  start(): void {
    if (this.#animationFrame !== undefined) return;
    const tick = (now: number): void => {
      if (this.#lastFrameAt !== undefined)
        this.#frameIntervalMs = smooth(
          this.#frameIntervalMs,
          now - this.#lastFrameAt,
        );
      this.#lastFrameAt = now;
      const started = performance.now();
      this.#draw();
      this.#renderWorkMs = smooth(
        this.#renderWorkMs,
        performance.now() - started,
      );
      this.#animationFrame = requestAnimationFrame(tick);
    };
    this.#animationFrame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.#animationFrame !== undefined)
      cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    this.#lastFrameAt = undefined;
    this.#frameIntervalMs = null;
    this.#renderWorkMs = null;
  }

  #draw(): void {
    const ratio = this.#limitPixelRatio ? 1 : window.devicePixelRatio || 1;
    this.#pixelRatio = ratio;
    const width = Math.round(this.#canvas.clientWidth * ratio);
    const height = Math.round(this.#canvas.clientHeight * ratio);
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
    const context = this.#context;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (this.#blackout) return;
    context.fillStyle = "#101418";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#3b4652";
    context.font = `${Math.round(16 * ratio)}px system-ui, sans-serif`;
    context.fillText(this.#label, 24 * ratio, height - 24 * ratio);
  }
}

function smooth(average: number | null, sample: number): number {
  return average === null ? sample : average + SMOOTHING * (sample - average);
}
