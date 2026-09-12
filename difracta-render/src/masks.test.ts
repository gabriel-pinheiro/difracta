import { FULL_FRAME, type Quad } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  MASK_TEXTURE_FLOOR,
  MASK_TEXTURE_STEP,
  maskTextureSize,
} from "./masks.ts";

const size = (corners: Quad, maxDimension = 16384) =>
  maskTextureSize({
    corners,
    outputWidth: 1920,
    outputHeight: 1080,
    maxDimension,
  });

/** An axis-aligned Surface `width`×`height` frame pixels wide on the 1920×1080 Output. */
const rect = (width: number, height: number): Quad => ({
  topLeft: { x: 0, y: 0 },
  topRight: { x: width / 1920, y: 0 },
  bottomRight: { x: width / 1920, y: height / 1080 },
  bottomLeft: { x: 0, y: height / 1080 },
});

describe("maskTextureSize", () => {
  it("follows the Surface's extent on the Output, rounded up to the step", () => {
    expect(size(FULL_FRAME)).toEqual({ width: 1920, height: 1088 });
    expect(size(rect(700, 300))).toEqual({ width: 704, height: 320 });
    expect(MASK_TEXTURE_STEP).toBe(64);
  });

  it("keeps a small Surface at the floor", () => {
    expect(size(rect(100, 40))).toEqual({
      width: MASK_TEXTURE_FLOOR,
      height: MASK_TEXTURE_FLOOR,
    });
  });

  it("caps each side at the GPU's texture limit", () => {
    expect(size(FULL_FRAME, 1000)).toEqual({ width: 1000, height: 576 });
    expect(size(rect(1000, 1000), 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it("does not change with a corner moved inside a step", () => {
    expect(size(rect(701, 301))).toEqual(size(rect(700, 300)));
    expect(size(rect(705, 321))).not.toEqual(size(rect(700, 300)));
  });

  it("ignores Render Scale and the physical size", () => {
    // 1920 wide and 1080 tall on the Output, whatever the Surface says it measures.
    expect(size(FULL_FRAME)).toEqual({ width: 1920, height: 1088 });
  });
});
