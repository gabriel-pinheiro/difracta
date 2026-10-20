import {
  CORNERS,
  outputSlices,
  placedCorners,
  projectionFrame,
  type Document,
  type PixelRect,
  type Slice,
} from "@difracta/core";

import { compileProgram, uniform } from "./gl.ts";
import {
  deleteShaderBuffer,
  fitShaderBuffer,
  type ShaderBuffer,
} from "./shader-buffers.ts";

/**
 * How an Output with Slices is drawn: the frame is rendered offscreen at
 * its Projection Frame's size, laid out like the stage, and this pass then
 * copies each Slice into the canvas at its Display rectangle, turned and
 * scaled back, black wherever no Slice lands. The Display Frame is fitted
 * into the canvas at one scale, anchored top-left, so it is exact when the
 * canvas has its size or matches it on one side and is larger on the other.
 */
export interface SlicedFrame {
  readonly slices: readonly Slice[];
  /** The Projection Frame in Projection pixels. */
  readonly frame: PixelRect;
  /** The offscreen frame's size: the Projection Frame's, capped at the GPU's texture limit. */
  readonly width: number;
  readonly height: number;
  /** The Projection Frame was larger than the GPU allows and is drawn scaled down. */
  readonly capped: boolean;
  /** The Display Frame's size in Display pixels. */
  readonly display: { readonly width: number; readonly height: number };
}

/** The Output's sliced frame, or undefined when it has no Slices. */
export function slicedFrame(
  document: Pick<Document, "outputs" | "slices">,
  outputId: string,
  maxDimension: number,
): SlicedFrame | undefined {
  const output = document.outputs[outputId];
  if (output === undefined) return undefined;
  const slices = outputSlices(document.slices, outputId);
  const frame = projectionFrame(output, slices);
  if (slices.length === 0 || frame === undefined) return undefined;
  const fit = Math.min(
    1,
    maxDimension / frame.width,
    maxDimension / frame.height,
  );
  return {
    slices,
    frame,
    width: Math.max(1, Math.floor(frame.width * fit)),
    height: Math.max(1, Math.floor(frame.height * fit)),
    capped: fit < 1,
    // Commands keep a Display size on an Output with Slices; the Slices'
    // own extent stands in for one a hand-edited file left out.
    display: output.displaySize ?? {
      width: Math.max(...slices.map((s) => s.rect.x + s.rect.width)),
      height: Math.max(...slices.map((s) => s.rect.y + s.rect.height)),
    },
  };
}

/** Floats per vertex: clip x, y, then texture u, v. */
const STRIDE = 4;
const TRIANGLES = [0, 1, 2, 0, 2, 3] as const;

/**
 * Two triangles per Slice: its Display rectangle fitted into a canvas of
 * `canvasWidth` by `canvasHeight`, in clip space, each corner sampling the
 * offscreen frame where that corner was placed. The texture's rows run
 * bottom up, as a framebuffer's do.
 */
export function sliceVertices(
  sliced: SlicedFrame,
  canvasWidth: number,
  canvasHeight: number,
): Float32Array {
  const { frame, display } = sliced;
  const fit = Math.min(
    canvasWidth / display.width,
    canvasHeight / display.height,
  );
  const data = new Float32Array(sliced.slices.length * 6 * STRIDE);
  let offset = 0;
  for (const slice of sliced.slices) {
    const { x, y, width, height } = slice.rect;
    const corners = [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ] as const;
    const placed = placedCorners(slice);
    for (const index of TRIANGLES) {
      const [dx, dy] = corners[index] ?? [0, 0];
      const corner = CORNERS[index] ?? "topLeft";
      const source = placed[corner];
      data[offset++] = ((dx * fit) / canvasWidth) * 2 - 1;
      data[offset++] = 1 - ((dy * fit) / canvasHeight) * 2;
      data[offset++] = (source.x - frame.x) / frame.width;
      data[offset++] = 1 - (source.y - frame.y) / frame.height;
    }
  }
  return data;
}

const VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_frame;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = vec4(texture(u_frame, v_uv).rgb, 1.0);
}`;

/**
 * The offscreen Projection Frame and the pass that slices it into the
 * canvas. The frame's texture exists only while an Output with Slices is
 * drawn.
 */
export class SlicePass {
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #buffer: WebGLBuffer;
  #target: ShaderBuffer | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#program = compileProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    gl.useProgram(this.#program);
    gl.uniform1i(uniform(gl, this.#program, "u_frame"), 0);
    this.#buffer = gl.createBuffer();
  }

  /** The offscreen frame's framebuffer, sized for `sliced`, or the canvas's (null) without one. */
  framebuffer(sliced: SlicedFrame | undefined): WebGLFramebuffer | null {
    if (sliced === undefined) {
      this.release();
      return null;
    }
    this.#target = fitShaderBuffer(this.#gl, this.#target, sliced);
    this.#unbind();
    return this.#target.framebuffer;
  }

  /** Copies each Slice from the offscreen frame into the canvas, cleared to black first. */
  present(
    sliced: SlicedFrame,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const target = this.#target;
    if (target === undefined) return;
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const vertices = sliceVertices(sliced, canvasWidth, canvasHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    const bytes = STRIDE * Float32Array.BYTES_PER_ELEMENT;
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, bytes, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, bytes, bytes / 2);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / STRIDE);
    gl.disableVertexAttribArray(1);
    gl.enable(gl.BLEND);
    this.#unbind();
  }

  /**
   * Leaves the offscreen frame bound to no texture unit: drawing into it
   * while a program's sampler unit holds it is a feedback loop, and WebGL
   * refuses the draw even when the sampler goes unread.
   */
  #unbind(): void {
    const gl = this.#gl;
    for (const unit of [gl.TEXTURE1, gl.TEXTURE0]) {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  /** Frees the offscreen frame, kept until an Output with Slices needs it again. */
  release(): void {
    if (this.#target !== undefined) deleteShaderBuffer(this.#gl, this.#target);
    this.#target = undefined;
  }

  dispose(): void {
    this.release();
    this.#gl.deleteProgram(this.#program);
    this.#gl.deleteBuffer(this.#buffer);
  }
}
