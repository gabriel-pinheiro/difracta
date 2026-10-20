import type { Slice, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { knownFrameSize, pixelFrame } from "./output-frame";

const output = { id: "led", displaySize: { width: 1920, height: 1080 } };
const slices = {
  a: {
    id: "a",
    outputId: "led",
    order: "a0",
    rect: { x: 0, y: 0, width: 960, height: 1080 },
    position: { x: 0, y: 0 },
    rotation: 90,
    scale: 1,
  },
} as unknown as Table<Slice>;

describe("knownFrameSize", () => {
  it("takes the Slices' bounding box over a session's report", () => {
    expect(
      knownFrameSize(output, slices, { width: 3840, height: 2160 }),
    ).toEqual({ x: 0, y: 0, width: 1080, height: 960 });
  });

  it("takes a session's report, else the Display size, without Slices", () => {
    expect(knownFrameSize(output, {}, { width: 1280, height: 720 })).toEqual({
      width: 1280,
      height: 720,
    });
    expect(knownFrameSize(output, {}, undefined)).toEqual(output.displaySize);
    expect(
      knownFrameSize({ id: "tv", displaySize: null }, {}, undefined),
    ).toBeUndefined();
  });
});

describe("pixelFrame", () => {
  it("is the Display Frame of an unsliced Output with a Display size", () => {
    expect(pixelFrame(output, {})).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(pixelFrame({ id: "tv", displaySize: null }, {})).toBeUndefined();
  });
});
