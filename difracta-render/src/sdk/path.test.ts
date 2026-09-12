import { describe, expect, it } from "vitest";

import { pathGeometry, pathTracker, pathUniformPoints } from "./path.ts";

const square = {
  points: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ],
  closed: true,
};

describe("pathGeometry", () => {
  it("measures in pixels and samples by fraction of the length", () => {
    const geometry = pathGeometry(square, 200, 100);
    expect(geometry.points[1]).toEqual({ x: 150, y: 25 });
    // Two 100 px sides and two 50 px sides.
    expect(geometry.length).toBe(300);
    expect(geometry.at(0)).toEqual({ x: 50, y: 25, tx: 1, ty: 0 });
    // A quarter of the way is 75 px along the top edge.
    expect(geometry.at(0.25)).toEqual({ x: 125, y: 25, tx: 1, ty: 0 });
    // Half way: 150 px, the top edge and the right side done.
    expect(geometry.at(0.5)).toEqual({ x: 150, y: 75, tx: 0, ty: 1 });
    // Closed: the last segment returns to the first point.
    expect(geometry.at(1)).toEqual({ x: 50, y: 25, tx: 0, ty: -1 });
    const open = pathGeometry({ ...square, closed: false }, 200, 100);
    expect(open.length).toBe(250);
    expect(open.at(1)).toEqual({ x: 50, y: 75, tx: -1, ty: 0 });
  });

  it("tells Side A from Side B by travel, and outward by the centroid", () => {
    const geometry = pathGeometry(square, 200, 100);
    const top = geometry.at(0.1);
    // Travelling right along the top edge, the left of travel is up on screen.
    expect(geometry.side(top, "a")).toEqual({ x: 0, y: -1 });
    expect(geometry.side(top, "b")).toEqual({ x: -0, y: 1 });
    expect(geometry.side(top, "outward")).toEqual({ x: 0, y: -1 });
    expect(geometry.side(top, "inward")).toEqual({ x: -0, y: 1 });
    // Drawn the other way round, outward still points up from the top edge.
    const reversed = pathGeometry(
      { ...square, points: [...square.points].reverse() },
      200,
      100,
    );
    const topAgain = reversed.at(0.7);
    expect(topAgain.tx).toBe(-1);
    expect(reversed.side(topAgain, "outward")).toEqual({ x: -0, y: -1 });
    expect(reversed.side(topAgain, "a")).toEqual({ x: 0, y: 1 });
  });

  it("packs points for a shader and tracks changes by identity", () => {
    const packed = pathUniformPoints(square);
    expect(packed).toHaveLength(32);
    expect([...packed.slice(0, 4)]).toEqual([0.25, 0.25, 0.75, 0.25]);
    expect(packed[8]).toBe(0);
    const tracker = pathTracker();
    const first = tracker.resolve({ frame: square }, 200, 100);
    expect(first.changed).toBe(true);
    const again = tracker.resolve({ frame: square }, 200, 100);
    expect(again.changed).toBe(false);
    expect(again.paths.frame).toBe(first.paths.frame);
    expect(tracker.resolve({ frame: { ...square } }, 200, 100).changed).toBe(
      true,
    );
    expect(tracker.resolve({}, 200, 100)).toEqual({ paths: {}, changed: true });
  });
});
