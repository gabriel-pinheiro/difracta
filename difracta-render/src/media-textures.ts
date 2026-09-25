import { createTexture } from "./gl.ts";
import type { MediaHandle } from "./sdk/media.ts";

/**
 * The GPU side of Media: one texture per handle an instance samples,
 * uploaded when the handle's version is newer than what the texture
 * holds, so an image goes up once and a video frame once per frame the
 * browser presents. Pictures are uploaded straight (not premultiplied),
 * since the shader Visual's fragment returns straight alpha and the engine
 * premultiplies after it, and rows top first, as a canvas Layer's texture
 * is, so `uv` reads the picture the way the Visual sees the Surface. A
 * handle with nothing behind it binds one transparent texel. Textures
 * follow the instances: `retain` keeps the handles still held by a running
 * instance and deletes the rest.
 */
interface Entry {
  readonly texture: WebGLTexture;
  version: number;
}

export class MediaTextures {
  readonly #gl: WebGL2RenderingContext;
  readonly #entries = new Map<MediaHandle, Entry>();
  readonly #blank: WebGLTexture;
  readonly #failed = new Set<MediaHandle>();

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#blank = createTexture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4),
    );
  }

  /** Binds the picture behind `handle` on the active texture unit, uploading it if it is new. */
  bind(handle: MediaHandle): void {
    const gl = this.#gl;
    const image = handle.image;
    if (image === null || handle.version === 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.#blank);
      return;
    }
    let entry = this.#entries.get(handle);
    if (entry === undefined) {
      entry = { texture: createTexture(gl), version: 0 };
      this.#entries.set(handle, entry);
    }
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    if (entry.version === handle.version) return;
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      entry.version = handle.version;
    } catch (error: unknown) {
      // A picture the page may not read (a cross-origin file without CORS)
      // is refused by the upload; say so once and show nothing for it.
      if (!this.#failed.has(handle)) {
        this.#failed.add(handle);
        console.error(`Media “${handle.id}” cannot be uploaded:`, error);
      }
      entry.version = handle.version;
      gl.bindTexture(gl.TEXTURE_2D, this.#blank);
    }
  }

  /** Deletes the textures of every handle not in `live`. */
  retain(live: ReadonlySet<MediaHandle>): void {
    for (const [handle, entry] of this.#entries)
      if (!live.has(handle)) {
        this.#gl.deleteTexture(entry.texture);
        this.#entries.delete(handle);
        this.#failed.delete(handle);
      }
  }

  dispose(): void {
    for (const entry of this.#entries.values())
      this.#gl.deleteTexture(entry.texture);
    this.#entries.clear();
    this.#failed.clear();
    this.#gl.deleteTexture(this.#blank);
  }
}
