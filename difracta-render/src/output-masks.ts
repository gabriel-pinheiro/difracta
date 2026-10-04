import type { OutputMask } from "@difracta/core";

import { createScratchCanvas, createTexture } from "./gl.ts";
import {
  composeMasks,
  frameSpace,
  sameMasks,
  type Scratch,
} from "./mask-raster.ts";
import { uploadAlpha } from "./masks.ts";
import type { SurfaceGeometry } from "./surface-geometry.ts";
import { MODE, WHOLE, type SurfaceProgram } from "./surface-program.ts";

/** The size of the texture an Output's masks are rasterized into: the frame's pixels, each side capped at the GPU's texture limit. */
export function outputMaskTextureSize(
  width: number,
  height: number,
  maxDimension: number,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.min(width, maxDimension)),
    height: Math.max(1, Math.min(height, maxDimension)),
  };
}

/**
 * When the Output Mask texture is rebuilt: the first time, when the masks
 * change (the document is immutable per revision, so identity comparison
 * of the mask objects is exact), or when the texture's size does.
 */
export class OutputMaskKey {
  #masks: readonly OutputMask[] = [];
  #width = 0;
  #height = 0;

  /** Records the frame's masks and size; true when they differ from the last call. */
  changed(
    masks: readonly OutputMask[],
    width: number,
    height: number,
  ): boolean {
    if (
      sameMasks(this.#masks, masks) &&
      this.#width === width &&
      this.#height === height
    )
      return false;
    this.#masks = masks;
    this.#width = width;
    this.#height = height;
    return true;
  }
}

/**
 * One alpha texture for the Output a compositor serves, holding its Output
 * Masks' closed coverage at the frame's size: the full-frame pass draws
 * black through it, so alpha is 1 where the masks close. Composed in
 * Projection Frame space (`frameSpace`), feather uniform in pixels. Freed
 * when a frame has no masks.
 */
export class OutputMaskTexture {
  readonly #gl: WebGL2RenderingContext;
  readonly #maxDimension: number;
  readonly #key = new OutputMaskKey();
  #texture: WebGLTexture | undefined;
  #layer: Scratch | undefined;
  #shape: Scratch | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#maxDimension = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }

  /** The texture for the Output's masks this frame, or undefined when it has none. */
  get(
    masks: readonly OutputMask[],
    frameWidth: number,
    frameHeight: number,
  ): WebGLTexture | undefined {
    if (masks.length === 0) {
      this.dispose();
      return undefined;
    }
    const { width, height } = outputMaskTextureSize(
      frameWidth,
      frameHeight,
      this.#maxDimension,
    );
    const texture = (this.#texture ??= createTexture(this.#gl));
    if (!this.#key.changed(masks, width, height)) return texture;
    const layer = (this.#layer ??= createScratchCanvas(width, height));
    const shape = (this.#shape ??= createScratchCanvas(width, height));
    for (const scratch of [layer, shape])
      if (scratch.canvas.width !== width || scratch.canvas.height !== height) {
        scratch.canvas.width = width;
        scratch.canvas.height = height;
      }
    composeMasks(layer, shape, masks, frameSpace(width, height), true);
    uploadAlpha(this.#gl, texture, layer.canvas);
    return texture;
  }

  dispose(): void {
    if (this.#texture !== undefined) this.#gl.deleteTexture(this.#texture);
    this.#texture = undefined;
    this.#layer = undefined;
    this.#shape = undefined;
    this.#key.changed([], 0, 0);
  }
}

/**
 * The full-frame pass: black drawn through the closed coverage, so the
 * frame keeps its picture where the masks are open and goes black where
 * they close. `frame` is the full frame's geometry; the program is current.
 */
export function cutFrame(
  program: SurfaceProgram,
  frame: SurfaceGeometry,
  texture: WebGLTexture,
): void {
  const { gl, uniforms } = program;
  program.setSurface(frame);
  program.setMask(texture);
  gl.uniform4f(uniforms.rect, ...WHOLE);
  gl.uniform1i(uniforms.mode, MODE.flat);
  gl.uniform4f(uniforms.color, 0, 0, 0, 1);
  program.drawQuad();
}
