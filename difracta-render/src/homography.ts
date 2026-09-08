import type { Quad } from "@difracta/core";

/**
 * The projective map from Surface Space (the unit square, y down) to the
 * Projection Frame (also 0..1, y down) for one mapping, as a column-major
 * 3×3 matrix for `uniformMatrix3fv`. A point maps as `H · (u, v, 1)` with the
 * result divided by its third component. Undefined when the corners are
 * degenerate (three on a line, or a bow-tie), which cannot be projected.
 *
 * Why a homography and not a mesh: four corners fully determine a projective
 * transform, the GPU interpolates it perspective-correctly for free when the
 * quad is drawn with its clip-space w set to that third component, and every
 * later shape (Regions, Masks, Guides) inherits the same mapping by living
 * in Surface Space.
 */
export function homography(corners: Quad): Float32Array | undefined {
  const { x: x0, y: y0 } = corners.topLeft;
  const { x: x1, y: y1 } = corners.topRight;
  const { x: x2, y: y2 } = corners.bottomRight;
  const { x: x3, y: y3 } = corners.bottomLeft;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-12) return undefined;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  // The quad must not fold: every corner's w must keep one sign.
  const ws = [1, g + 1, g + h + 1, h + 1];
  if (ws.some((w) => w <= 1e-9)) return undefined;
  if (Math.abs(a * e - b * d) < 1e-12) return undefined;
  return new Float32Array([a, d, g, b, e, h, x0, y0, 1]);
}

/** Applies a homography to one Surface Space point; for tests and label placement. */
export function project(
  matrix: Float32Array,
  u: number,
  v: number,
): { readonly x: number; readonly y: number } {
  const [a = 0, d = 0, g = 0, b = 0, e = 0, h = 0, c = 0, f = 0, i = 1] =
    matrix;
  const w = g * u + h * v + i;
  return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
}
