/**
 * Placeholder Projection Frame: black in Blackout, otherwise a dim field with
 * the Output's label. The renderer replaces the body of `draw`.
 */
export class FrameCanvas {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #blackout = false;
  #label = "";
  #animationFrame: number | undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas 2D is unavailable.");
    this.#context = context;
  }

  update(state: { readonly blackout: boolean; readonly label: string }): void {
    this.#blackout = state.blackout;
    this.#label = state.label;
  }

  start(): void {
    if (this.#animationFrame !== undefined) return;
    const tick = (): void => {
      this.#draw();
      this.#animationFrame = requestAnimationFrame(tick);
    };
    this.#animationFrame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.#animationFrame !== undefined)
      cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
  }

  #draw(): void {
    const ratio = window.devicePixelRatio || 1;
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
