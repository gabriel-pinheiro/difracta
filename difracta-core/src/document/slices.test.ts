import { describe, expect, it } from "vitest";

import { id } from "../ids.ts";

import type { Document, Slice, Surface } from "./document.ts";
import { FULL_FRAME } from "./geometry.ts";
import { enabledCorners } from "./mappings.ts";
import {
  followedQuad,
  placedCorners,
  placedRect,
  projectionFrame,
  displayOverlaps,
  insideDisplay,
  rectsOverlap,
} from "./slices.ts";

const output = {
  id: "out_a",
  displaySize: { width: 1920, height: 1080 },
} as const;

function slice(
  fields: Partial<Omit<Slice, "id">> & { readonly id: string },
): Slice {
  return {
    name: fields.id,
    outputId: "out_a",
    rect: { x: 0, y: 0, width: 100, height: 50 },
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    order: "a0",
    ...fields,
    id: id("slice", fields.id),
  };
}

describe("placedRect", () => {
  it("swaps width and height at quarter turns and multiplies by scale", () => {
    expect(placedRect(slice({ id: "s", rotation: 90, scale: 2 }))).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 200,
    });
    expect(placedRect(slice({ id: "s", rotation: 180 }))).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });
});

describe("projectionFrame", () => {
  it("is the Display Frame without Slices, undefined without a Display size", () => {
    expect(projectionFrame(output, [])).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(projectionFrame({ displaySize: null }, [])).toBeUndefined();
  });

  it("equals the Display Frame for one Slice covering it", () => {
    const whole = slice({
      id: "s",
      rect: { x: 0, y: 0, width: 1920, height: 1080 },
    });
    expect(projectionFrame(output, [whole])).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("bounds every placed Slice, negative positions and rotations included", () => {
    const frame = projectionFrame(output, [
      slice({ id: "a", position: { x: -40, y: 10 } }),
      slice({ id: "b", position: { x: 200, y: -20 }, rotation: 270 }),
    ]);
    // b is 50 wide and 100 tall once turned: right edge 250, bottom 80.
    expect(frame).toEqual({ x: -40, y: -20, width: 290, height: 100 });
  });

  it("rounds a scaled side up to whole pixels, without float noise", () => {
    const frame = projectionFrame(output, [
      slice({
        id: "a",
        rect: { x: 0, y: 0, width: 3, height: 3 },
        scale: 0.333,
      }),
    ]);
    expect(frame).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const exact = projectionFrame(output, [
      slice({
        id: "a",
        rect: { x: 0, y: 0, width: 1000, height: 10 },
        scale: 1.5,
      }),
    ]);
    expect(exact?.width).toBe(1500);
  });
});

describe("placedCorners", () => {
  it("turns the Display top-left to the placed top-right at 90°", () => {
    const corners = placedCorners(slice({ id: "s", rotation: 90 }));
    expect(corners.topLeft).toEqual({ x: 50, y: 0 });
    expect(corners.bottomLeft).toEqual({ x: 0, y: 0 });
  });
});

describe("rectsOverlap", () => {
  it("counts shared pixels, not shared edges", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap(a, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
  });
});

describe("displayOverlaps and insideDisplay", () => {
  it("pairs each overlapping Slice with the ones it overlaps", () => {
    const a = slice({ id: "a" });
    const b = slice({ id: "b", rect: { x: 50, y: 0, width: 100, height: 50 } });
    const c = slice({ id: "c", rect: { x: 300, y: 0, width: 10, height: 10 } });
    const overlaps = displayOverlaps([a, b, c]);
    expect(overlaps.get("a")?.map((other) => other.id)).toEqual(["b"]);
    expect(overlaps.get("b")?.map((other) => other.id)).toEqual(["a"]);
    expect(overlaps.has("c")).toBe(false);
  });

  it("checks all four edges", () => {
    const size = { width: 100, height: 50 };
    expect(insideDisplay({ x: 0, y: 0, width: 100, height: 50 }, size)).toBe(
      true,
    );
    expect(insideDisplay({ x: 1, y: 0, width: 100, height: 50 }, size)).toBe(
      false,
    );
    expect(insideDisplay({ x: 0, y: 1, width: 100, height: 50 }, size)).toBe(
      false,
    );
  });
});

describe("enabledCorners", () => {
  const slices = {
    left: slice({ id: "left", rect: { x: 0, y: 0, width: 100, height: 50 } }),
    right: slice({
      id: "right",
      rect: { x: 100, y: 0, width: 100, height: 50 },
      position: { x: 300, y: 0 },
    }),
  };
  const document = {
    outputs: {
      out_a: { ...output, name: "A", limitPixelRatio: false, order: "a0" },
    },
    slices,
  } as unknown as Pick<Document, "outputs" | "slices">;
  const corners = {
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.9, y: 0.9 },
    bottomLeft: { x: 0.1, y: 0.9 },
  };
  function surface(follow?: Surface["mappings"][string]["follow"]): Surface {
    return {
      id: "sur",
      name: "Wall",
      renderScale: 1,
      size: null,
      order: "a0",
      mappings: {
        out_a: { enabled: true, corners, ...(follow ? { follow } : {}) },
      },
    } as unknown as Surface;
  }

  it("gives corners, a followed Slice's placed rectangle, or the whole frame", () => {
    expect(enabledCorners(document, surface(), "out_a")).toEqual(corners);
    // The frame runs 0..400 by 0..50; right sits at 300..400.
    expect(
      enabledCorners(document, surface({ slice: "right" }), "out_a"),
    ).toEqual({
      topLeft: { x: 0.75, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0.75, y: 1 },
    });
    expect(enabledCorners(document, surface({ frame: true }), "out_a")).toEqual(
      FULL_FRAME,
    );
    expect(enabledCorners(document, surface(), "out_b")).toBeUndefined();
  });

  it("falls back to corners for a Slice the Output no longer has", () => {
    expect(
      followedQuad(document.outputs.out_a!, document.slices, { slice: "gone" }),
    ).toBeUndefined();
    expect(
      enabledCorners(document, surface({ slice: "gone" }), "out_a"),
    ).toEqual(corners);
  });
});
