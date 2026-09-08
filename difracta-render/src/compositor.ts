import type { Document, Point, Quad } from "@difracta/core";

import { compileProgram, uniform } from "./gl.ts";
import { homography, project } from "./homography.ts";
import { Labels } from "./labels.ts";
import { MaskTextures } from "./masks.ts";
import { CORNER_INDEX, planFrame, type SurfaceDraw } from "./plan.ts";
import { FRAGMENT_SOURCE, MODE, VERTEX_SOURCE } from "./shaders.ts";

export interface Compositor {
  /**
   * Draws the Output's frame for `document` into a canvas of the given
   * backing size, unless nothing changed since the previous call, and says
   * whether it drew. The caller owns the animation loop and the canvas size.
   */
  render(
    document: Document,
    outputId: string,
    width: number,
    height: number,
  ): boolean;
  dispose(): void;
}

const CORNER_LABELS = ["TL", "TR", "BR", "BL"] as const;
/** Grid cells across the calibration pattern. */
const PATTERN_DIVISIONS = 8;
const FILL: Color = [0.4, 0.4, 0.4, 1];
const OUTLINE: Color = [1, 1, 1, 0.55];
const MASK_EDGE: Color = [0.4, 0.85, 1, 0.9];
const MARKER: Color = [0.4, 0.85, 1, 0.9];
const SELECTED_MARKER: Color = [1, 0.72, 0.2, 1];
const LABEL_HEIGHT = 0.08;
const CORNER_LABEL_HEIGHT = 0.045;
const CORNER_LABEL_INSET = 0.07;
const MARKER_SIZE = 0.03;
const SELECTED_MARKER_SIZE = 0.045;

type Color = readonly [number, number, number, number];
type Rect = readonly [number, number, number, number];
const WHOLE: Rect = [0, 0, 1, 1];

interface Resources {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly uniforms: Record<
    | "homography"
    | "rect"
    | "mode"
    | "color"
    | "maskEnabled"
    | "divisions"
    | "corner"
    | "emphasis",
    WebGLUniformLocation
  >;
  readonly quad: WebGLBuffer;
  readonly loop: WebGLBuffer;
  readonly dynamic: WebGLBuffer;
  readonly masks: MaskTextures;
  readonly labels: Labels;
  /** Homographies by Surface, valid while the mapping's corners object is the same. */
  readonly matrices: Map<string, { corners: Quad; matrix: Float32Array }>;
}

export function createCompositor(canvas: HTMLCanvasElement): Compositor {
  return new WebGLCompositor(canvas);
}

/**
 * WebGL2 compositor for one Output. It keeps GPU resources per Surface
 * (mask texture, homography) and skips frames whose inputs did not change,
 * so a static Installation costs the Output nothing between edits.
 */
class WebGLCompositor implements Compositor {
  readonly #canvas: HTMLCanvasElement;
  #resources: Resources | undefined;
  #lost = false;
  #last:
    | {
        document: Document;
        outputId: string;
        width: number;
        height: number;
      }
    | undefined;
  readonly #onLost = (event: Event): void => {
    event.preventDefault();
    this.#lost = true;
    this.#resources = undefined;
  };
  readonly #onRestored = (): void => {
    this.#lost = false;
    this.#last = undefined;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    canvas.addEventListener("webglcontextlost", this.#onLost);
    canvas.addEventListener("webglcontextrestored", this.#onRestored);
    this.#resources = this.#setup();
  }

  render(
    document: Document,
    outputId: string,
    width: number,
    height: number,
  ): boolean {
    if (this.#lost) return false;
    const last = this.#last;
    if (
      last?.document === document &&
      last.outputId === outputId &&
      last.width === width &&
      last.height === height
    )
      return false;
    this.#last = { document, outputId, width, height };
    const resources = (this.#resources ??= this.#setup());
    const { gl } = resources;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const plan = planFrame(document, outputId);
    if (plan.blackout) return true;

    gl.useProgram(resources.program);
    const masked = new Set<string>();
    for (const draw of plan.draws) {
      const matrix = this.#matrix(resources, draw);
      if (matrix === undefined) continue;
      gl.uniformMatrix3fv(resources.uniforms.homography, false, matrix);
      const maskTexture = resources.masks.get(draw.surface.id, draw.masks);
      if (maskTexture !== undefined) masked.add(draw.surface.id);
      this.#drawSurface(resources, draw, maskTexture, matrix, width, height);
    }
    resources.masks.retain(masked);
    return true;
  }

  dispose(): void {
    this.#canvas.removeEventListener("webglcontextlost", this.#onLost);
    this.#canvas.removeEventListener("webglcontextrestored", this.#onRestored);
    const resources = this.#resources;
    if (resources === undefined) return;
    resources.masks.dispose();
    resources.labels.dispose();
    resources.gl.deleteProgram(resources.program);
    resources.gl.deleteBuffer(resources.quad);
    resources.gl.deleteBuffer(resources.loop);
    resources.gl.deleteBuffer(resources.dynamic);
    this.#resources = undefined;
  }

  #setup(): Resources {
    const gl = this.#canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (gl === null) throw new Error("WebGL2 is unavailable on this display.");
    const program = compileProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    gl.useProgram(program);
    gl.uniform1i(uniform(gl, program, "u_mask"), 0);
    gl.uniform1i(uniform(gl, program, "u_texture"), 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(gl.createVertexArray());
    gl.enableVertexAttribArray(0);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    const loop = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, loop);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    return {
      gl,
      program,
      uniforms: {
        homography: uniform(gl, program, "u_homography"),
        rect: uniform(gl, program, "u_rect"),
        mode: uniform(gl, program, "u_mode"),
        color: uniform(gl, program, "u_color"),
        maskEnabled: uniform(gl, program, "u_mask_enabled"),
        divisions: uniform(gl, program, "u_divisions"),
        corner: uniform(gl, program, "u_corner"),
        emphasis: uniform(gl, program, "u_emphasis"),
      },
      quad,
      loop,
      dynamic: gl.createBuffer(),
      masks: new MaskTextures(gl),
      labels: new Labels(gl),
      matrices: new Map(),
    };
  }

  #matrix(resources: Resources, draw: SurfaceDraw): Float32Array | undefined {
    const cached = resources.matrices.get(draw.surface.id);
    if (cached?.corners === draw.corners) return cached.matrix;
    const matrix = homography(draw.corners);
    if (matrix === undefined) {
      resources.matrices.delete(draw.surface.id);
      return undefined;
    }
    resources.matrices.set(draw.surface.id, { corners: draw.corners, matrix });
    return matrix;
  }

  #drawSurface(
    resources: Resources,
    draw: SurfaceDraw,
    maskTexture: WebGLTexture | undefined,
    matrix: Float32Array,
    width: number,
    height: number,
  ): void {
    const { gl, uniforms } = resources;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture ?? null);
    gl.uniform1i(uniforms.maskEnabled, maskTexture === undefined ? 0 : 1);
    if (draw.style === "outline") {
      this.#lines(resources, resources.loop, 4, OUTLINE);
      return;
    }
    gl.uniform4f(uniforms.rect, ...WHOLE);
    if (draw.style === "fill") {
      gl.uniform1i(uniforms.mode, MODE.flat);
      gl.uniform4f(uniforms.color, ...FILL);
      this.#quad(resources);
      return;
    }
    gl.uniform1i(uniforms.mode, MODE.pattern);
    gl.uniform1f(uniforms.divisions, PATTERN_DIVISIONS);
    gl.uniform1f(uniforms.emphasis, draw.highlighted ? 1 : 0.55);
    gl.uniform1i(
      uniforms.corner,
      draw.corner === undefined ? -1 : CORNER_INDEX[draw.corner],
    );
    this.#quad(resources);
    if (!draw.highlighted) return;

    // Labels and the Mask outline sit on top, unmasked.
    gl.uniform1i(uniforms.maskEnabled, 0);
    const aspect = projectedAspect(matrix, width, height);
    this.#label(resources, draw.surface.name, LABEL_HEIGHT, aspect, (w, h) => [
      0.5 - w / 2,
      0.5 - h / 2,
    ]);
    if (draw.maskOutline === undefined) {
      CORNER_LABELS.forEach((text, index) => {
        this.#label(resources, text, CORNER_LABEL_HEIGHT, aspect, (w, h) => [
          index === 1 || index === 2
            ? 1 - CORNER_LABEL_INSET - w
            : CORNER_LABEL_INSET,
          index >= 2 ? 1 - CORNER_LABEL_INSET - h : CORNER_LABEL_INSET,
        ]);
      });
      return;
    }
    const { mask, point } = draw.maskOutline;
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.dynamic);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(mask.points.flatMap((p) => [p.x, p.y])),
      gl.DYNAMIC_DRAW,
    );
    this.#lines(resources, resources.dynamic, mask.points.length, MASK_EDGE);
    mask.points.forEach((p, index) => {
      this.#marker(resources, p, index === point);
    });
  }

  #quad(resources: Resources): void {
    const { gl } = resources;
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  #lines(
    resources: Resources,
    buffer: WebGLBuffer,
    count: number,
    color: Color,
  ): void {
    const { gl, uniforms } = resources;
    gl.uniform4f(uniforms.rect, ...WHOLE);
    gl.uniform1i(uniforms.mode, MODE.flat);
    gl.uniform1i(uniforms.maskEnabled, 0);
    gl.uniform4f(uniforms.color, ...color);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINE_LOOP, 0, count);
  }

  #marker(resources: Resources, point: Point, selected: boolean): void {
    const { gl, uniforms } = resources;
    const size = selected ? SELECTED_MARKER_SIZE : MARKER_SIZE;
    gl.uniform1i(uniforms.mode, MODE.marker);
    gl.uniform4f(uniforms.color, ...(selected ? SELECTED_MARKER : MARKER));
    gl.uniform4f(
      uniforms.rect,
      point.x - size / 2,
      point.y - size / 2,
      size,
      size,
    );
    this.#quad(resources);
  }

  /** Draws `text` as a quad `height` tall in Surface Space, placed by `at(width, height)`. */
  #label(
    resources: Resources,
    text: string,
    height: number,
    surfaceAspect: number,
    at: (width: number, height: number) => readonly [number, number],
  ): void {
    const { gl, uniforms } = resources;
    const label = resources.labels.get(text);
    const width = (height * label.aspect) / surfaceAspect;
    const [x, y] = at(width, height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, label.texture);
    gl.uniform1i(uniforms.mode, MODE.label);
    gl.uniform4f(uniforms.color, 1, 1, 1, 1);
    gl.uniform4f(uniforms.rect, x, y, width, height);
    this.#quad(resources);
  }
}

/** Width over height of the Surface's bounding box on screen, so text keeps its proportions. */
function projectedAspect(
  matrix: Float32Array,
  width: number,
  height: number,
): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const) {
    const p = project(matrix, u, v);
    xs.push(p.x * width);
    ys.push(p.y * height);
  }
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return h < 1 ? 1 : Math.max(0.05, w / h);
}
