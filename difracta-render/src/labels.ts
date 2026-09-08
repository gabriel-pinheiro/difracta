import { createScratchCanvas, createTexture } from "./gl.ts";

export interface Label {
  readonly texture: WebGLTexture;
  /** Width divided by height of the rendered text, for sizing its quad. */
  readonly aspect: number;
}

/** Height of the rendered glyphs in texture pixels; labels are drawn smaller than this on screen. */
const GLYPH_HEIGHT = 64;
const PADDING = 8;
/** Textures kept; past this the least recently used go, which never matters in practice. */
const CAPACITY = 64;

/** Text rendered once per string into a small texture, drawn as a quad in Surface Space. */
export class Labels {
  readonly #gl: WebGL2RenderingContext;
  readonly #entries = new Map<string, Label>();
  #scratch: ReturnType<typeof createScratchCanvas> | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
  }

  get(text: string): Label {
    const cached = this.#entries.get(text);
    if (cached !== undefined) {
      // Refresh recency.
      this.#entries.delete(text);
      this.#entries.set(text, cached);
      return cached;
    }
    const label = this.#render(text);
    this.#entries.set(text, label);
    if (this.#entries.size > CAPACITY) {
      const [oldest] = this.#entries;
      if (oldest !== undefined) {
        this.#gl.deleteTexture(oldest[1].texture);
        this.#entries.delete(oldest[0]);
      }
    }
    return label;
  }

  dispose(): void {
    for (const label of this.#entries.values())
      this.#gl.deleteTexture(label.texture);
    this.#entries.clear();
  }

  #render(text: string): Label {
    this.#scratch ??= createScratchCanvas(1, 1);
    const { canvas, context } = this.#scratch;
    const font = `600 ${String(GLYPH_HEIGHT)}px system-ui, sans-serif`;
    context.font = font;
    const width = Math.ceil(context.measureText(text).width) + PADDING * 2;
    const height = GLYPH_HEIGHT + PADDING * 2;
    canvas.width = width;
    canvas.height = height;
    context.font = font;
    context.textBaseline = "middle";
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.fillText(text, PADDING, height / 2);
    const gl = this.#gl;
    const texture = createTexture(gl);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    return { texture, aspect: width / height };
  }
}
