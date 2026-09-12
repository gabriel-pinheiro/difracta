import {
  surfaceCanvasSize,
  type Mask,
  type Point,
  type Quad,
} from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import type { SurfaceDraw } from "./plan.ts";

/** No Mask texture is smaller than this on either side. */
export const MASK_TEXTURE_FLOOR = 256;
/** Mask textures grow in steps of this many texels, so a corner drag rarely resizes one. */
export const MASK_TEXTURE_STEP = 64;

/**
 * The size of the texture a Surface's Masks are rasterized into: the
 * Surface's extent on the Output as `surfaceCanvasSize` measures it for
 * Layer canvases, without the physical-size aspect and at Render Scale 1,
 * since Mask edges follow the pixels they land on; each side is then
 * rounded up to the next step, kept above the floor, and capped at the
 * GPU's texture limit. Width and height follow the Surface separately.
 */
export function maskTextureSize({
  corners,
  outputWidth,
  outputHeight,
  maxDimension,
}: {
  readonly corners: Quad;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly maxDimension: number;
}): { readonly width: number; readonly height: number } {
  const extent = surfaceCanvasSize({
    corners,
    outputWidth,
    outputHeight,
    size: null,
    renderScale: 1,
    maxDimension,
  });
  const fit = (side: number): number =>
    Math.min(
      maxDimension,
      Math.max(
        MASK_TEXTURE_FLOOR,
        Math.ceil(side / MASK_TEXTURE_STEP) * MASK_TEXTURE_STEP,
      ),
    );
  return { width: fit(extent.width), height: fit(extent.height) };
}

type Scratch = ReturnType<typeof createScratchCanvas>;

interface Entry {
  masks: readonly Mask[];
  width: number;
  height: number;
  readonly texture: WebGLTexture;
}

/**
 * Keeps one alpha texture per Surface, rebuilt only when that Surface's Masks
 * change (the document is immutable per revision, so identity comparison of
 * the Mask objects is exact) or the texture's size does. The composition
 * rule: fully open without Include Masks and fully closed with any, then
 * every Mask in order opens or closes its polygon. Feather fades inward
 * from the polygon edge, clipped to it, so no Mask changes coverage outside
 * its own boundary.
 */
export class MaskTextures {
  readonly #gl: WebGL2RenderingContext;
  readonly #maxDimension: number;
  readonly #entries = new Map<string, Entry>();
  #layer: Scratch | undefined;
  #shape: Scratch | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#maxDimension = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }

  /** The texture for a Surface's Masks as drawn on this frame, or undefined when there are none to apply. */
  get(
    draw: Pick<SurfaceDraw, "surface" | "corners" | "masks">,
    outputWidth: number,
    outputHeight: number,
  ): WebGLTexture | undefined {
    const { masks } = draw;
    if (masks.length === 0) return undefined;
    let entry = this.#entries.get(draw.surface.id);
    if (entry === undefined) {
      entry = {
        masks: [],
        width: 0,
        height: 0,
        texture: createTexture(this.#gl),
      };
      this.#entries.set(draw.surface.id, entry);
    }
    const { width, height } = maskTextureSize({
      corners: draw.corners,
      outputWidth,
      outputHeight,
      maxDimension: this.#maxDimension,
    });
    if (
      !sameMasks(entry.masks, masks) ||
      entry.width !== width ||
      entry.height !== height
    ) {
      entry.masks = masks;
      entry.width = width;
      entry.height = height;
      this.#upload(entry);
    }
    return entry.texture;
  }

  /** Frees the textures of every Surface not listed: the ones that left the plan. */
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

  /**
   * Rasterizes in Surface Space: the transform scales the unit square to
   * the texture, strokes included, so a feather is the same fraction of
   * the Surface on both axes whatever the texture's aspect. Only the blur
   * that softens the feather is in texels, taken from the mean side.
   */
  #upload(entry: Entry): void {
    const { width, height, masks, texture } = entry;
    const { canvas, context } = this.#scratch("layer", width, height);
    context.setTransform(width, 0, 0, height, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#fff";
    if (!masks.some((mask) => mask.mode === "include"))
      context.fillRect(0, 0, 1, 1);
    for (const mask of masks) {
      const blurPx = (mask.feather * (width + height)) / 8;
      context.save();
      tracePolygon(context, mask.points);
      context.clip();
      context.globalCompositeOperation =
        mask.mode === "include" ? "source-over" : "destination-out";
      if (blurPx >= 0.25) {
        const shape = this.#scratch("shape", width, height);
        featheredShape(shape.context, mask.points, width, height, mask.feather);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.filter = `blur(${String(blurPx)}px)`;
        context.drawImage(shape.canvas, 0, 0);
      } else {
        tracePolygon(context, mask.points);
        context.fill();
      }
      context.restore();
    }
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** One of the two scratch canvases, at the size asked; resizing clears it. */
  #scratch(which: "layer" | "shape", width: number, height: number): Scratch {
    let scratch = which === "layer" ? this.#layer : this.#shape;
    if (scratch === undefined) {
      scratch = createScratchCanvas(width, height);
      if (which === "layer") this.#layer = scratch;
      else this.#shape = scratch;
    } else if (
      scratch.canvas.width !== width ||
      scratch.canvas.height !== height
    ) {
      scratch.canvas.width = width;
      scratch.canvas.height = height;
    }
    return scratch;
  }
}

function sameMasks(a: readonly Mask[], b: readonly Mask[]): boolean {
  return a.length === b.length && a.every((mask, index) => mask === b[index]);
}

function tracePolygon(
  context: Scratch["context"],
  points: readonly Point[],
): void {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
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
  width: number,
  height: number,
  feather: number,
): void {
  context.setTransform(width, 0, 0, height, 0, 0);
  context.filter = "none";
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = "#fff";
  tracePolygon(context, points);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = feather;
  tracePolygon(context, points);
  context.stroke();
}
