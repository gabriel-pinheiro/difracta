import { surfaceCanvasSize, type Mask, type Quad } from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import {
  composeMasks,
  sameMasks,
  surfaceSpace,
  type Scratch,
} from "./mask-raster.ts";
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
 * rule (`mask-raster.ts`): fully open without Include Masks and fully
 * closed with any, then every Mask in order opens or closes its polygon,
 * feather extending the dark side, so a feathered Mask never lights more
 * than a hard one. Alpha is the open coverage the fragment shader
 * multiplies by.
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

  /** Rasterizes the entry's Masks in Surface Space and uploads the result. */
  #upload(entry: Entry): void {
    const { width, height, masks, texture } = entry;
    const layer = this.#scratch("layer", width, height);
    const shape = this.#scratch("shape", width, height);
    composeMasks(layer, shape, masks, surfaceSpace(width, height));
    uploadAlpha(this.#gl, texture, layer.canvas);
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

/** Uploads a scratch canvas as the texture's pixels, premultiplied as the compositor blends. */
export function uploadAlpha(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  canvas: Scratch["canvas"],
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
}
