import { createTexture } from "./gl.ts";

/**
 * Where a shader Visual rendering below its Surface's resolution draws: a
 * texture of the reduced size behind a framebuffer, one per Layer, kept
 * while its size holds and redrawn only on the frames its instance reports
 * a change, then composited over the Surface like a canvas Layer's texture.
 */
export interface ShaderBuffer {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

/** The lowest resolution a Visual may ask for; below it a Surface is a few blurred blocks. */
export const MIN_SHADER_RESOLUTION = 0.1;

/** The buffer size for a Surface of `width` by `height` pixels at `resolution`; undefined at full resolution. */
export function shaderBufferSize(
  width: number,
  height: number,
  resolution: number,
): { readonly width: number; readonly height: number } | undefined {
  if (!(resolution < 1)) return undefined;
  const scale = Math.max(MIN_SHADER_RESOLUTION, resolution);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * `current` when it already has `size`; otherwise a buffer of that size,
 * reusing `current`'s GPU objects, or none (deleting `current`) when there
 * is no size. A different object means nothing is drawn in it yet.
 */
export function fitShaderBuffer(
  gl: WebGL2RenderingContext,
  current: ShaderBuffer | undefined,
  size: { readonly width: number; readonly height: number } | undefined,
): ShaderBuffer | undefined {
  if (size === undefined) {
    if (current !== undefined) deleteShaderBuffer(gl, current);
    return undefined;
  }
  if (current?.width === size.width && current.height === size.height)
    return current;
  const texture = current?.texture ?? createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    size.width,
    size.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  let framebuffer = current?.framebuffer;
  if (framebuffer === undefined) {
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  return { framebuffer, texture, width: size.width, height: size.height };
}

export function deleteShaderBuffer(
  gl: WebGL2RenderingContext,
  buffer: ShaderBuffer,
): void {
  gl.deleteFramebuffer(buffer.framebuffer);
  gl.deleteTexture(buffer.texture);
}
