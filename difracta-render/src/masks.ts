import type { Mask, Point } from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";

/**
 * Side of the square alpha texture a Surface's Masks are rasterized into.
 * Masks live in Surface Space, so the texture is independent of the frame:
 * it is built once per edit, not per resize, and sampled linearly so its
 * edges stay smooth when the Surface is larger than this on screen.
 */
export const MASK_TEXTURE_SIZE = 512;

type Scratch = ReturnType<typeof createScratchCanvas>;

interface Entry {
  masks: readonly Mask[];
  readonly texture: WebGLTexture;
}

/**
 * Keeps one alpha texture per Surface, rebuilt only when that Surface's Masks
 * change (the document is immutable per revision, so identity comparison of
 * the Mask objects is exact). The composition rule: fully open without
 * Include Masks and fully closed with any, then every Mask in order opens or
 * closes its polygon. Feather fades inward from the polygon edge, clipped to
 * it, so no Mask changes coverage outside its own boundary.
 */
export class MaskTextures {
  readonly #gl: WebGL2RenderingContext;
  readonly #entries = new Map<string, Entry>();
  #layer: Scratch | undefined;
  #shape: Scratch | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
  }

  /** The texture for a Surface's Masks, or undefined when there are none to apply. */
  get(surfaceId: string, masks: readonly Mask[]): WebGLTexture | undefined {
    if (masks.length === 0) return undefined;
    let entry = this.#entries.get(surfaceId);
    if (entry === undefined) {
      entry = { masks: [], texture: createTexture(this.#gl) };
      this.#entries.set(surfaceId, entry);
    }
    if (!sameMasks(entry.masks, masks)) {
      entry.masks = masks;
      this.#upload(entry.texture, masks);
    }
    return entry.texture;
  }

  /** Frees textures of Surfaces that no longer exist or have no Masks. */
  retain(surfaceIds: ReadonlySet<string>): void {
    for (const [surfaceId, entry] of this.#entries) {
      if (surfaceIds.has(surfaceId)) continue;
      this.#gl.deleteTexture(entry.texture);
      this.#entries.delete(surfaceId);
    }
  }

  dispose(): void {
    this.retain(new Set());
  }

  #upload(texture: WebGLTexture, masks: readonly Mask[]): void {
    const size = MASK_TEXTURE_SIZE;
    this.#layer ??= createScratchCanvas(size, size);
    const { canvas, context } = this.#layer;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    context.clearRect(0, 0, size, size);
    context.fillStyle = "#fff";
    if (!masks.some((mask) => mask.mode === "include"))
      context.fillRect(0, 0, size, size);
    for (const mask of masks) {
      const featherPx = mask.feather * size;
      context.save();
      tracePolygon(context, mask.points, size);
      context.clip();
      context.globalCompositeOperation =
        mask.mode === "include" ? "source-over" : "destination-out";
      if (featherPx >= 1) {
        this.#shape ??= createScratchCanvas(size, size);
        featheredShape(this.#shape.context, mask.points, size, featherPx);
        context.filter = `blur(${String(featherPx / 4)}px)`;
        context.drawImage(this.#shape.canvas, 0, 0);
      } else {
        tracePolygon(context, mask.points, size);
        context.fill();
      }
      context.restore();
    }
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }
}

function sameMasks(a: readonly Mask[], b: readonly Mask[]): boolean {
  return a.length === b.length && a.every((mask, index) => mask === b[index]);
}

function tracePolygon(
  context: Scratch["context"],
  points: readonly Point[],
  size: number,
): void {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x * size, point.y * size);
    else context.lineTo(point.x * size, point.y * size);
  });
  context.closePath();
}

/**
 * The polygon eroded by half the feather: a stroke centred on the boundary
 * eats that much inward, and the outer half is clipped away by the caller.
 * Blurred by the caller, the result ramps from the edge to full coverage.
 */
function featheredShape(
  context: Scratch["context"],
  points: readonly Point[],
  size: number,
  featherPx: number,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = "none";
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#fff";
  tracePolygon(context, points, size);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = featherPx;
  tracePolygon(context, points, size);
  context.stroke();
}
