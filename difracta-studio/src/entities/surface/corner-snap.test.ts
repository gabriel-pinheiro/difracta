import type { Quad } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { snapCorner } from "./corner-snap";

const left: Quad = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 0.5, y: 0 },
  bottomRight: { x: 0.5, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};
// 200 screen pixels across the frame: 6 px is 0.03 of it.
const context = { altKey: false, screenPerUnit: { x: 200, y: 100 } };

describe("snapCorner", () => {
  it("lands on a Slice's edge or corner within a few screen pixels", () => {
    expect(snapCorner({ x: 0.52, y: 0.5 }, [left], context)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(snapCorner({ x: 0.49, y: 0.97 }, [left], context)).toEqual({
      x: 0.5,
      y: 1,
    });
    expect(snapCorner({ x: 0.6, y: 0.5 }, [left], context)).toEqual({
      x: 0.6,
      y: 0.5,
    });
  });

  it("leaves the point alone while Alt is held", () => {
    expect(
      snapCorner({ x: 0.52, y: 0.5 }, [left], { ...context, altKey: true }),
    ).toEqual({ x: 0.52, y: 0.5 });
  });
});
