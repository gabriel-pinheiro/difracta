import type { Quad } from "@difracta/core";

import { homography, invertHomography, project } from "./homography.ts";
import type { SurfaceDraw } from "./plan.ts";

/**
 * How far past the Surface's edge its quad is drawn, in frame pixels. The
 * fragment shader fades every fill out over one pixel centred on the edge
 * (`edgeCoverage` in `shaders.ts`); the outer half of that fade only has
 * fragments because the geometry reaches this far beyond the edge.
 */
export const EDGE_MARGIN_PX = 1;
/**
 * A corner's outward shift grows as its angle sharpens; below this cosine
 * term it stops growing, so a Surface seen nearly edge-on does not sprout
 * a long spike. The fade loses a little of its outer half at such a corner.
 */
const MITER_LIMIT = 0.25;

const UNIT_CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/** What one Surface's draws share: its mapping and the quad they are drawn with. */
export interface SurfaceGeometry {
  readonly matrix: Float32Array;
  /**
   * The Surface's quad in Surface Space as two triangles, six vertices,
   * grown outward by the margin; its coordinates run slightly outside
   * 0..1 and the fragment shader's coverage decides where the edge is.
   */
  readonly quad: Float32Array;
}

/**
 * The Surface's quad expanded by the margin, computed where the margin
 * is defined, on the Output's pixels: each projected corner moves along
 * the miter of its two edges so both edges shift outward by the margin,
 * then the moved corners come back through the inverse homography. The
 * vertices are Surface Space positions like every other vertex, so the
 * same vertex shader projects them and interpolates Surface Space across
 * the grown quad exactly. Expanding here rather than drawing the bounding
 * rectangle and discarding keeps the overdraw at a one-pixel rim.
 */
export function expandedQuad(
  matrix: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const corners = UNIT_CORNERS.map(([u, v]) => {
    const p = project(matrix, u, v);
    return [p.x * width, p.y * height] as const;
  });
  const centre = corners.reduce(
    ([x, y], [px, py]) => [x + px / 4, y + py / 4],
    [0, 0],
  );
  // Unit normal of edge i (corner i to i+1), pointing away from the centre.
  const normals = corners.map(([x0, y0], index) => {
    const [x1, y1] = corners[(index + 1) % 4] ?? [x0, y0];
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    let nx = (y1 - y0) / length;
    let ny = (x0 - x1) / length;
    const outward =
      nx * ((x0 + x1) / 2 - centre[0]) + ny * ((y0 + y1) / 2 - centre[1]);
    if (outward < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny] as const;
  });
  const inverse = invertHomography(matrix);
  const moved = corners.map(([x, y], index) => {
    const [ix, iy] = normals[(index + 3) % 4] ?? [0, 0];
    const [ox, oy] = normals[index] ?? [0, 0];
    const factor =
      EDGE_MARGIN_PX / Math.max(MITER_LIMIT, 1 + ix * ox + iy * oy);
    const p = project(
      inverse,
      (x + (ix + ox) * factor) / width,
      (y + (iy + oy) * factor) / height,
    );
    return [p.x, p.y] as const;
  });
  const [q0, q1, q2, q3] = moved as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  return new Float32Array([...q0, ...q1, ...q2, ...q0, ...q2, ...q3]);
}

interface Entry {
  readonly corners: Quad;
  readonly width: number;
  readonly height: number;
  readonly geometry: SurfaceGeometry;
}

/**
 * One geometry per Surface, kept while the mapping's corners object and
 * the frame size stay the same: the corners are immutable per document
 * revision, so identity is the comparison. Undefined for a mapping that
 * cannot be projected (see `homography`).
 */
export class SurfaceGeometries {
  readonly #entries = new Map<string, Entry>();

  get(
    draw: Pick<SurfaceDraw, "surface" | "corners">,
    width: number,
    height: number,
  ): SurfaceGeometry | undefined {
    const entry = this.#entries.get(draw.surface.id);
    if (
      entry?.corners === draw.corners &&
      entry.width === width &&
      entry.height === height
    )
      return entry.geometry;
    const matrix = homography(draw.corners);
    if (matrix === undefined) {
      this.#entries.delete(draw.surface.id);
      return undefined;
    }
    const geometry = { matrix, quad: expandedQuad(matrix, width, height) };
    this.#entries.set(draw.surface.id, {
      corners: draw.corners,
      width,
      height,
      geometry,
    });
    return geometry;
  }
}
