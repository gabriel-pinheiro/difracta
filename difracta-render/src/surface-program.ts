import { compileProgram, uniform } from "./gl.ts";
import { FRAGMENT_SOURCE, MODE, VERTEX_SOURCE } from "./shaders.ts";
import type { SurfaceGeometry } from "./surface-geometry.ts";

export type Color = readonly [number, number, number, number];
/** A sub-rectangle of Surface Space: x, y, width, height. */
export type Rect = readonly [number, number, number, number];
export const WHOLE: Rect = [0, 0, 1, 1];

export { MODE };

/**
 * The program that draws in Surface Space through a homography: Layer
 * canvases, calibration patterns, outlines, markers and labels all go
 * through it (see `shaders.ts`). It owns the unit quad sub-rectangle
 * draws and full-frame passes share, and the current Surface's grown quad
 * (`surface-geometry.ts`) that whole-Surface draws use, with texture unit
 * 0 reserved for the Surface's Mask and unit 1 for the picture being
 * drawn.
 */
export class SurfaceProgram {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly quad: WebGLBuffer;
  /** The current Surface's quad, as `setSurface` left it; shader Visuals draw it too. */
  readonly surface: WebGLBuffer;
  readonly uniforms: Record<
    | "homography"
    | "rect"
    | "mode"
    | "color"
    | "maskEnabled"
    | "maskRect"
    | "edge"
    | "divisions"
    | "corner"
    | "emphasis",
    WebGLUniformLocation
  >;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const program = compileProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    gl.useProgram(program);
    gl.uniform1i(uniform(gl, program, "u_mask"), 0);
    gl.uniform1i(uniform(gl, program, "u_texture"), 1);
    this.program = program;
    this.uniforms = {
      homography: uniform(gl, program, "u_homography"),
      rect: uniform(gl, program, "u_rect"),
      mode: uniform(gl, program, "u_mode"),
      color: uniform(gl, program, "u_color"),
      maskEnabled: uniform(gl, program, "u_mask_enabled"),
      maskRect: uniform(gl, program, "u_mask_rect"),
      edge: uniform(gl, program, "u_edge"),
      divisions: uniform(gl, program, "u_divisions"),
      corner: uniform(gl, program, "u_corner"),
      emphasis: uniform(gl, program, "u_emphasis"),
    };
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    this.surface = gl.createBuffer();
  }

  /** Makes this the current program; call again after another program drew. */
  use(): void {
    this.gl.useProgram(this.program);
  }

  /** Makes a Surface current: its homography and the quad its draws cover. */
  setSurface(geometry: SurfaceGeometry): void {
    const { gl } = this;
    gl.uniformMatrix3fv(this.uniforms.homography, false, geometry.matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surface);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.quad, gl.DYNAMIC_DRAW);
  }

  /**
   * Binds the Surface's Mask on unit 0, or turns masking off. `rect` is
   * the part of Surface Space the current draw covers, so a Region samples
   * its Surface's Mask where it sits.
   */
  setMask(texture: WebGLTexture | undefined, rect: Rect = WHOLE): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
    gl.uniform1i(this.uniforms.maskEnabled, texture === undefined ? 0 : 1);
    gl.uniform4f(this.uniforms.maskRect, ...rect);
  }

  /** Draws the whole current Surface, its edge feathered, with the uniforms as they are. */
  drawSurface(): void {
    const { gl } = this;
    gl.uniform1i(this.uniforms.edge, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surface);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Draws the unit quad, placed by `u_rect`, with the uniforms as they are. */
  drawQuad(): void {
    const { gl } = this;
    gl.uniform1i(this.uniforms.edge, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** A line through `count` points held in `buffer`, closed back to the first unless told otherwise, unmasked. */
  drawLoop(
    buffer: WebGLBuffer,
    count: number,
    color: Color,
    closed = true,
  ): void {
    const { gl, uniforms } = this;
    gl.uniform4f(uniforms.rect, ...WHOLE);
    gl.uniform1i(uniforms.mode, MODE.flat);
    gl.uniform1i(uniforms.maskEnabled, 0);
    gl.uniform1i(uniforms.edge, 0);
    gl.uniform4f(uniforms.color, ...color);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(closed ? gl.LINE_LOOP : gl.LINE_STRIP, 0, count);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteBuffer(this.quad);
    this.gl.deleteBuffer(this.surface);
  }
}
