import type { Output, Slice, Surface, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  outputWarningCount,
  outputWithoutSurface,
  sliceOverlapWarning,
  sliceSizeMismatch,
} from "./output-warning";

const outputs = {
  wall: { id: "wall", name: "Wall", order: "a0" },
  side: { id: "side", name: "Side", order: "a1" },
} as unknown as Table<Output>;

const surfaces = {
  front: { id: "front", mappings: { wall: { enabled: true } } },
  back: { id: "back", mappings: { side: { enabled: false } } },
} as unknown as Table<Surface>;

describe("Output warnings", () => {
  it("flags an Output no Surface is on", () => {
    expect(outputWithoutSurface("wall", surfaces)).toBe(false);
    expect(outputWithoutSurface("side", surfaces)).toBe(true);
  });

  it("counts the rows that warn", () => {
    expect(outputWarningCount(outputs, surfaces)).toBe(1);
    expect(outputWarningCount(outputs, {})).toBe(2);
    expect(outputWarningCount({}, surfaces)).toBe(0);
  });
});

describe("sliceSizeMismatch", () => {
  const output = { displaySize: { width: 1920, height: 1080 } };

  it("reports the size a session draws at when it is not the Display Frame", () => {
    expect(
      sliceSizeMismatch(output, true, { width: 3840, height: 2160 }),
    ).toEqual({ width: 3840, height: 2160 });
  });

  it("says nothing when sizes match, unsliced, unsized or unreported", () => {
    expect(
      sliceSizeMismatch(output, true, { width: 1920, height: 1080 }),
    ).toBeUndefined();
    expect(
      sliceSizeMismatch(output, false, { width: 3840, height: 2160 }),
    ).toBeUndefined();
    expect(
      sliceSizeMismatch({ displaySize: null }, true, { width: 1, height: 1 }),
    ).toBeUndefined();
    expect(sliceSizeMismatch(output, true, undefined)).toBeUndefined();
  });
});

describe("sliceOverlapWarning", () => {
  it("names the Slices that overlap in the Display Frame, and counts the row", () => {
    const rect = (x: number) => ({ x, y: 0, width: 100, height: 100 });
    const slices = {
      a: {
        id: "a",
        name: "Panel 1",
        outputId: "wall",
        rect: rect(0),
        order: "a0",
      },
      b: {
        id: "b",
        name: "Panel 2",
        outputId: "wall",
        rect: rect(50),
        order: "a1",
      },
      c: {
        id: "c",
        name: "Panel 3",
        outputId: "wall",
        rect: rect(200),
        order: "a2",
      },
    } as unknown as Table<Slice>;
    expect(sliceOverlapWarning(slices, "wall")).toBe(
      "Slices overlap in the Display Frame: Panel 1 and Panel 2. The later Slice shows where they do.",
    );
    expect(sliceOverlapWarning(slices, "side")).toBeUndefined();
    expect(outputWarningCount(outputs, surfaces, slices)).toBe(2);
  });
});
