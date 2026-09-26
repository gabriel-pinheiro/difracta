import type { Point, RegionBounds } from "@difracta/core";

import { project } from "./homography.ts";
import { Labels } from "./labels.ts";
import { CORNER_INDEX, type RegionOutline, type SurfaceDraw } from "./plan.ts";
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
const PATH_EDGE: Color = [1, 0.85, 0.3, 0.95];
const REGION_EDGE: Color = [0.75, 1, 0.55, 0.95];
const REGION_EDGE_DIM: Color = [0.75, 1, 0.55, 0.45];
const MARKER: Color = [0.4, 0.85, 1, 0.9];
const SELECTED_MARKER: Color = [1, 0.72, 0.2, 1];
const LABEL_HEIGHT = 0.08;
const REGION_LABEL_HEIGHT = 0.05;
const CORNER_LABEL_HEIGHT = 0.045;
const CORNER_LABEL_INSET = 0.07;
const MARKER_SIZE = 0.03;
const SELECTED_MARKER_SIZE = 0.045;

/**
 * What an Output shows in Calibration Mode: each Surface as a fill, an
 * outline or the pattern, the calibrated one with its name, corner labels
 * and, when a Mask or Path is being aligned, its line and point markers;
 * its Regions as named rectangles while the quad or one of them is
 * aligned, that one with its corners marked. Everything is drawn in
 * Surface Space through the shared program, so it lands exactly where the
 * Scene will.
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

  /** Draws one Surface; the program is current and the Surface set on it. */
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
      program.drawSurface();
      return;
    }
    gl.uniform1i(uniforms.mode, MODE.pattern);
    gl.uniform1f(uniforms.divisions, PATTERN_DIVISIONS);
    gl.uniform1f(uniforms.emphasis, draw.highlighted ? 1 : 0.55);
    gl.uniform1i(
      uniforms.corner,
      draw.corner === undefined ? -1 : CORNER_INDEX[draw.corner],
    );
    program.drawSurface();
    if (!draw.highlighted) return;

    // Labels and the Mask or Path line sit on top, unmasked.
    gl.uniform1i(uniforms.maskEnabled, 0);
    const aspect = projectedAspect(matrix, width, height);
    this.#label(draw.surface.name, LABEL_HEIGHT, aspect, (w, h) => [
      0.5 - w / 2,
      0.5 - h / 2,
    ]);
    if (draw.maskOutline !== undefined) {
      const { mask, point } = draw.maskOutline;
      this.#line(mask.points, true, MASK_EDGE, point);
      return;
    }
    if (draw.pathOutline !== undefined) {
      const { path, point } = draw.pathOutline;
      this.#line(path.points, path.closed, PATH_EDGE, point);
      return;
    }
    for (const outline of draw.regions) this.#region(outline, aspect);
    // The quad's corner labels would sit under a Region's own corners.
    if (draw.regions.some((outline) => outline.highlighted)) return;
    CORNER_LABELS.forEach((text, index) => {
      this.#label(text, CORNER_LABEL_HEIGHT, aspect, (w, h) => [
        index === 1 || index === 2
          ? 1 - CORNER_LABEL_INSET - w
          : CORNER_LABEL_INSET,
        index >= 2 ? 1 - CORNER_LABEL_INSET - h : CORNER_LABEL_INSET,
      ]);
    });
  }

  /** A Region's rectangle with its name inside; the aligned one brighter, its two corners marked. */
  #region(
    { region, highlighted, corner }: RegionOutline,
    surfaceAspect: number,
  ): void {
    const { topLeft, bottomRight } = region.bounds;
    const points = rectanglePoints(region.bounds);
    const program = this.#program;
    const { gl } = program;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#dynamic);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(points.flatMap((p) => [p.x, p.y])),
      gl.DYNAMIC_DRAW,
    );
    program.drawLoop(
      this.#dynamic,
      points.length,
      highlighted ? REGION_EDGE : REGION_EDGE_DIM,
    );
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    // The name shrinks to stay inside a small Region.
    const labelHeight = Math.min(REGION_LABEL_HEIGHT, height * 0.5);
    this.#label(region.name, labelHeight, surfaceAspect, (w, h) => [
      topLeft.x + width / 2 - w / 2,
      topLeft.y + height / 2 - h / 2,
    ]);
    if (!highlighted) return;
    this.#marker(topLeft, corner === "topLeft");
    this.#marker(bottomRight, corner === "bottomRight");
  }

  /** A shape's line through its points, with a marker on each and the selected one larger. */
  #line(
    points: readonly Point[],
    closed: boolean,
    color: Color,
    selected: number | undefined,
  ): void {
    const program = this.#program;
    const { gl } = program;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#dynamic);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(points.flatMap((p) => [p.x, p.y])),
      gl.DYNAMIC_DRAW,
    );
    program.drawLoop(this.#dynamic, points.length, color, closed);
    points.forEach((p, index) => {
      this.#marker(p, index === selected);
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

/** The rectangle's corners in drawing order, clockwise from the top left. */
function rectanglePoints({
  topLeft,
  bottomRight,
}: RegionBounds): readonly Point[] {
  return [
    topLeft,
    { x: bottomRight.x, y: topLeft.y },
    bottomRight,
    { x: topLeft.x, y: bottomRight.y },
  ];
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
