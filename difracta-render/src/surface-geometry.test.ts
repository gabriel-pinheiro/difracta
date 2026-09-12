import { FULL_FRAME, type Quad } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { homography, invertHomography, project } from "./homography.ts";
import { EDGE_MARGIN_PX, expandedQuad } from "./surface-geometry.ts";

const diamond: Quad = {
  topLeft: { x: 0.5, y: 0.1 },
  topRight: { x: 0.9, y: 0.5 },
  bottomRight: { x: 0.5, y: 0.9 },
  bottomLeft: { x: 0.1, y: 0.5 },
};

const trapezoid: Quad = {
  topLeft: { x: 0.2, y: 0.1 },
  topRight: { x: 0.8, y: 0.1 },
  bottomRight: { x: 1, y: 0.9 },
  bottomLeft: { x: 0, y: 0.9 },
};

const UNIT = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/** The four grown corners of the quad, in frame pixels. */
function grownCornersPx(
  corners: Quad,
  width: number,
  height: number,
): readonly (readonly [number, number])[] {
  const matrix = homography(corners)!;
  const quad = expandedQuad(matrix, width, height);
  return [0, 1, 2, 5].map((vertex) => {
    const p = project(matrix, quad[vertex * 2]!, quad[vertex * 2 + 1]!);
    return [p.x * width, p.y * height] as const;
  });
}

/** Signed distance from a point to the line through two others, positive away from `inside`. */
function distanceToEdge(
  [px, py]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  [ix, iy]: readonly [number, number],
): number {
  const length = Math.hypot(bx - ax, by - ay);
  const nx = (by - ay) / length;
  const ny = (ax - bx) / length;
  const sign = nx * (ix - ax) + ny * (iy - ay) < 0 ? 1 : -1;
  return sign * (nx * (px - ax) + ny * (py - ay));
}

describe("invertHomography", () => {
  it("undoes the projection", () => {
    const matrix = homography(trapezoid)!;
    const inverse = invertHomography(matrix);
    for (const [u, v] of [
      [0, 0],
      [1, 1],
      [0.3, 0.7],
    ] as const) {
      const p = project(matrix, u, v);
      const back = project(inverse, p.x, p.y);
      expect(back.x).toBeCloseTo(u, 6);
      expect(back.y).toBeCloseTo(v, 6);
    }
  });
});

describe("expandedQuad", () => {
  it("is two triangles sharing the first and third corner", () => {
    const quad = expandedQuad(homography(FULL_FRAME)!, 100, 50);
    expect(quad).toHaveLength(12);
    expect([quad[6], quad[7]]).toEqual([quad[0], quad[1]]);
    expect([quad[8], quad[9]]).toEqual([quad[4], quad[5]]);
  });

  it("grows the full frame by the margin on every side, in Surface Space", () => {
    const quad = expandedQuad(homography(FULL_FRAME)!, 100, 50);
    const dx = EDGE_MARGIN_PX / 100;
    const dy = EDGE_MARGIN_PX / 50;
    expect(quad[0]).toBeCloseTo(-dx, 6);
    expect(quad[1]).toBeCloseTo(-dy, 6);
    expect(quad[2]).toBeCloseTo(1 + dx, 6);
    expect(quad[3]).toBeCloseTo(-dy, 6);
    expect(quad[4]).toBeCloseTo(1 + dx, 6);
    expect(quad[5]).toBeCloseTo(1 + dy, 6);
    expect(quad[10]).toBeCloseTo(-dx, 6);
    expect(quad[11]).toBeCloseTo(1 + dy, 6);
  });

  it.each([
    ["a rotated Surface", diamond],
    ["a Surface in perspective", trapezoid],
  ])("moves each edge of %s outward by the margin on screen", (_, corners) => {
    const width = 1000;
    const height = 800;
    const matrix = homography(corners)!;
    const original = UNIT.map(([u, v]) => {
      const p = project(matrix, u, v);
      return [p.x * width, p.y * height] as const;
    });
    const centre = original.reduce<readonly [number, number]>(
      ([x, y], [px, py]) => [x + px / 4, y + py / 4],
      [0, 0],
    );
    const grown = grownCornersPx(corners, width, height);
    grown.forEach((corner, index) => {
      const previous = original[(index + 3) % 4]!;
      const current = original[index]!;
      const next = original[(index + 1) % 4]!;
      // The vertices are float32: within a thousandth of a pixel.
      expect(distanceToEdge(corner, previous, current, centre)).toBeCloseTo(
        EDGE_MARGIN_PX,
        3,
      );
      expect(distanceToEdge(corner, current, next, centre)).toBeCloseTo(
        EDGE_MARGIN_PX,
        3,
      );
    });
  });

  it("leaves Surface Space coordinates just outside the unit square", () => {
    const quad = expandedQuad(homography(diamond)!, 1000, 800);
    for (let index = 0; index < 12; index += 1) {
      const value = quad[index]!;
      expect(value < 0 || value > 1).toBe(true);
      expect(Math.abs(value - Math.round(value))).toBeLessThan(0.01);
    }
  });
});
