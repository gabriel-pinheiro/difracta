import { FULL_FRAME } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { homography, project } from "./homography.ts";

const trapezoid = {
  topLeft: { x: 0.2, y: 0.1 },
  topRight: { x: 0.8, y: 0.1 },
  bottomRight: { x: 1, y: 0.9 },
  bottomLeft: { x: 0, y: 0.9 },
};

describe("homography", () => {
  it("is the identity for the full frame", () => {
    const matrix = homography(FULL_FRAME)!;
    expect([...matrix].map((value) => value + 0)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
  });

  it("maps the unit square's corners onto the quad", () => {
    const matrix = homography(trapezoid)!;
    expect(project(matrix, 0, 0).x).toBeCloseTo(0.2);
    expect(project(matrix, 0, 0).y).toBeCloseTo(0.1);
    expect(project(matrix, 1, 0).x).toBeCloseTo(0.8);
    expect(project(matrix, 1, 1).x).toBeCloseTo(1);
    expect(project(matrix, 1, 1).y).toBeCloseTo(0.9);
    expect(project(matrix, 0, 1).x).toBeCloseTo(0);
  });

  it("sends the centre to the crossing of the diagonals", () => {
    // Diagonals TL–BR and TR–BL of the trapezoid cross at x = 0.5 and, by
    // symmetry, at the y where the two lines meet.
    const matrix = homography(trapezoid)!;
    const centre = project(matrix, 0.5, 0.5);
    expect(centre.x).toBeCloseTo(0.5);
    // Line TL→BR: (0.2,0.1)→(1,0.9): y = x - 0.1 → at x = 0.5, y = 0.4.
    expect(centre.y).toBeCloseTo(0.4);
  });

  it("refuses degenerate quads", () => {
    expect(
      homography({
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 0, y: 0 },
        bottomLeft: { x: 0, y: 1 },
      }),
    ).toBeUndefined();
    // Bow-tie: bottom corners swapped.
    expect(
      homography({
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 0, y: 1 },
        bottomLeft: { x: 1, y: 1 },
      }),
    ).toBeUndefined();
  });
});
