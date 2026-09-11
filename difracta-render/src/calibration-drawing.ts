import type { Point } from "@difracta/core";

import { project } from "./homography.ts";
import { Labels } from "./labels.ts";
import { CORNER_INDEX, type SurfaceDraw } from "./plan.ts";
import {
  MODE,
  WHOLE,
  type Color,
  type SurfaceProgram,
} from "./surface-program.ts";

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

/**
 * What an Output shows in Calibration Mode: each Surface as a fill, an
 * outline or the pattern, the calibrated one with its name, corner labels
 * and, when a Mask is being aligned, the Mask's outline and point markers.
 * Everything is drawn in Surface Space through the shared program, so it
 * lands exactly where the Scene will.
 */
export class CalibrationDrawing {
  readonly #program: SurfaceProgram;
  readonly #loop: WebGLBuffer;
  readonly #dynamic: WebGLBuffer;
  readonly #labels: Labels;

  constructor(program: SurfaceProgram) {
    this.#program = program;
    const { gl } = program;
    this.#loop = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#loop);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    this.#dynamic = gl.createBuffer();
    this.#labels = new Labels(gl);
  }

  /** Draws one Surface; the program is current and its homography set. */
  draw(
    draw: SurfaceDraw,
    maskTexture: WebGLTexture | undefined,
    matrix: Float32Array,
    width: number,
    height: number,
  ): void {
    const program = this.#program;
    const { gl, uniforms } = program;
    program.setMask(maskTexture);
    if (draw.style === "outline") {
      program.drawLoop(this.#loop, 4, OUTLINE);
      return;
    }
    gl.uniform4f(uniforms.rect, ...WHOLE);
    if (draw.style === "fill") {
      gl.uniform1i(uniforms.mode, MODE.flat);
      gl.uniform4f(uniforms.color, ...FILL);
      program.drawQuad();
      return;
    }
    gl.uniform1i(uniforms.mode, MODE.pattern);
    gl.uniform1f(uniforms.divisions, PATTERN_DIVISIONS);
    gl.uniform1f(uniforms.emphasis, draw.highlighted ? 1 : 0.55);
    gl.uniform1i(
      uniforms.corner,
      draw.corner === undefined ? -1 : CORNER_INDEX[draw.corner],
    );
    program.drawQuad();
    if (!draw.highlighted) return;

    // Labels and the Mask outline sit on top, unmasked.
    gl.uniform1i(uniforms.maskEnabled, 0);
    const aspect = projectedAspect(matrix, width, height);
    this.#label(draw.surface.name, LABEL_HEIGHT, aspect, (w, h) => [
      0.5 - w / 2,
      0.5 - h / 2,
    ]);
    if (draw.maskOutline === undefined) {
      CORNER_LABELS.forEach((text, index) => {
        this.#label(text, CORNER_LABEL_HEIGHT, aspect, (w, h) => [
          index === 1 || index === 2
            ? 1 - CORNER_LABEL_INSET - w
            : CORNER_LABEL_INSET,
          index >= 2 ? 1 - CORNER_LABEL_INSET - h : CORNER_LABEL_INSET,
        ]);
      });
      return;
    }
    const { mask, point } = draw.maskOutline;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#dynamic);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(mask.points.flatMap((p) => [p.x, p.y])),
      gl.DYNAMIC_DRAW,
    );
    program.drawLoop(this.#dynamic, mask.points.length, MASK_EDGE);
    mask.points.forEach((p, index) => {
      this.#marker(p, index === point);
    });
  }

  dispose(): void {
    const { gl } = this.#program;
    this.#labels.dispose();
    gl.deleteBuffer(this.#loop);
    gl.deleteBuffer(this.#dynamic);
  }

  #marker(point: Point, selected: boolean): void {
    const program = this.#program;
    const { gl, uniforms } = program;
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
    program.drawQuad();
  }

  /** Draws `text` as a quad `height` tall in Surface Space, placed by `at(width, height)`. */
  #label(
    text: string,
    height: number,
    surfaceAspect: number,
    at: (width: number, height: number) => readonly [number, number],
  ): void {
    const program = this.#program;
    const { gl, uniforms } = program;
    const label = this.#labels.get(text);
    const width = (height * label.aspect) / surfaceAspect;
    const [x, y] = at(width, height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, label.texture);
    gl.uniform1i(uniforms.mode, MODE.label);
    gl.uniform4f(uniforms.color, 1, 1, 1, 1);
    gl.uniform4f(uniforms.rect, x, y, width, height);
    program.drawQuad();
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
