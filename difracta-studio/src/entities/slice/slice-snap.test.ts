import type { Slice } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  displayTargets,
  nearest,
  snapDraw,
  snapMove,
  snapResize,
  snapScale,
  stageTargets,
} from "./slice-snap";

function slice(
  fields: Partial<Omit<Slice, "id">> & { readonly id?: string },
): Slice {
  return {
    id: "s",
    name: "S",
    outputId: "out",
    rect: { x: 0, y: 0, width: 100, height: 50 },
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    order: "a0",
    ...fields,
  } as unknown as Slice;
}

describe("nearest", () => {
  it("takes the closest target within the threshold", () => {
    expect(nearest(10, [0, 12, 9], 3)).toBe(9);
    expect(nearest(10, [20], 3)).toBeUndefined();
  });
});

describe("snapMove", () => {
  const other = slice({ rect: { x: 100, y: 0, width: 100, height: 50 } });
  const size = { width: 300, height: 100 };
  const targets = displayTargets(size, [other]);

  it("lands an edge on a neighbour's edge or the frame's", () => {
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    // Right edge at 48 + 50 = 98 snaps to 100.
    expect(snapMove(rect, 48, 2.4, targets, 4, size)).toEqual({ x: 50, y: 0 });
    // Left edge at 203 snaps to 200.
    expect(snapMove(rect, 203, 30, targets, 4, size)).toEqual({
      x: 200,
      y: 30,
    });
  });

  it("stops at every edge of the Display Frame, keeping the size", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(snapMove(rect, -20.6, -3, targets, 0, size)).toEqual({ x: 0, y: 0 });
    expect(snapMove(rect, 400, 95, targets, 0, size)).toEqual({
      x: 290,
      y: 90,
    });
    // Without bounds (the Projection pane) it goes anywhere.
    expect(snapMove(rect, -20.6, 40.4, targets, 0)).toEqual({ x: -21, y: 40 });
  });

  it("keeps a rectangle wider than the frame at its start", () => {
    const rect = { x: 0, y: 0, width: 400, height: 10 };
    expect(snapMove(rect, 30, 0, targets, 0, size)).toEqual({ x: 0, y: 0 });
  });
});

describe("snapResize", () => {
  const size = { width: 200, height: 100 };

  it("moves only the dragged corner's edges, keeping a pixel at least", () => {
    const rect = { x: 10, y: 10, width: 50, height: 50 };
    const targets = { x: [100], y: [] };
    expect(
      snapResize(rect, "bottomRight", { x: 98, y: 30.2 }, targets, 4, size),
    ).toEqual({ x: 10, y: 10, width: 90, height: 20 });
    expect(
      snapResize(rect, "topLeft", { x: 80, y: -5 }, targets, 0, size),
    ).toEqual({ x: 59, y: 0, width: 1, height: 60 });
  });

  it("stops the dragged edges at the far edges of the frame", () => {
    const rect = { x: 10, y: 10, width: 50, height: 50 };
    expect(
      snapResize(
        rect,
        "bottomRight",
        { x: 500, y: 500 },
        { x: [], y: [] },
        0,
        size,
      ),
    ).toEqual({ x: 10, y: 10, width: 190, height: 90 });
  });

  it("moves one side only from an edge handle", () => {
    const rect = { x: 10, y: 10, width: 50, height: 50 };
    const none = { x: [], y: [] };
    expect(snapResize(rect, "right", { x: 120, y: 90 }, none, 0, size)).toEqual(
      { x: 10, y: 10, width: 110, height: 50 },
    );
    expect(snapResize(rect, "top", { x: 0, y: -40 }, none, 0, size)).toEqual({
      x: 10,
      y: 0,
      width: 50,
      height: 60,
    });
    expect(snapResize(rect, "left", { x: 30, y: 0 }, none, 0, size)).toEqual({
      x: 30,
      y: 10,
      width: 30,
      height: 50,
    });
    expect(
      snapResize(rect, "bottom", { x: 0, y: 30 }, { x: [], y: [32] }, 4, size),
    ).toEqual({ x: 10, y: 10, width: 50, height: 22 });
  });
});

describe("snapDraw", () => {
  const size = { width: 200, height: 100 };
  const none = { x: [], y: [] };

  it("keeps a rectangle drawn from outside the frame inside it", () => {
    // Started a little above the frame, as when aiming at its top edge.
    expect(snapDraw({ x: 20, y: -6 }, { x: 80, y: 40 }, none, 0, size)).toEqual(
      { x: 20, y: 0, width: 60, height: 40 },
    );
    expect(
      snapDraw({ x: 150, y: 50 }, { x: 260, y: 130 }, none, 0, size),
    ).toEqual({ x: 150, y: 50, width: 50, height: 50 });
  });

  it("draws in any direction", () => {
    expect(snapDraw({ x: 80, y: 40 }, { x: 20, y: 10 }, none, 0, size)).toEqual(
      { x: 20, y: 10, width: 60, height: 30 },
    );
  });
});

describe("snapScale", () => {
  it("snaps the placed bottom edge to a neighbour's", () => {
    const left = slice({
      id: "l",
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    const right = slice({
      id: "r",
      rect: { x: 100, y: 0, width: 100, height: 50 },
      position: { x: 100, y: 0 },
    });
    const scale = snapScale(right, { x: 290, y: 97 }, stageTargets([left]), 5, {
      min: 0.25,
      max: 8,
    });
    expect(scale).toBe(2);
  });
});
