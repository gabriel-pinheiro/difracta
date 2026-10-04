import { id, type OutputMask } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { OutputMaskKey, outputMaskTextureSize } from "./output-masks.ts";

const mask = (name: string): OutputMask => ({
  id: id("outputMask", name),
  name,
  outputId: "out",
  mode: "exclude",
  points: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.5, y: 0.75 },
  ],
  feather: 0,
  order: "a0",
});

describe("outputMaskTextureSize", () => {
  it("is the frame's size, each side capped at the GPU's limit", () => {
    expect(outputMaskTextureSize(1920, 1080, 16384)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(outputMaskTextureSize(5000, 3000, 4096)).toEqual({
      width: 4096,
      height: 3000,
    });
    expect(outputMaskTextureSize(0, 0, 4096)).toEqual({ width: 1, height: 1 });
  });
});

describe("OutputMaskKey", () => {
  it("rebuilds on the first frame, then only when the mask objects or the size change", () => {
    const key = new OutputMaskKey();
    const a = mask("a");
    const b = mask("b");
    expect(key.changed([a, b], 1920, 1080)).toBe(true);
    expect(key.changed([a, b], 1920, 1080)).toBe(false);
    // A new revision of the same mask is a new object.
    expect(key.changed([{ ...a }, b], 1920, 1080)).toBe(true);
    expect(key.changed([b, a], 1920, 1080)).toBe(true);
    expect(key.changed([b, a], 1920, 1080)).toBe(false);
    expect(key.changed([b, a], 1280, 720)).toBe(true);
    expect(key.changed([b], 1280, 720)).toBe(true);
    expect(key.changed([b], 1280, 720)).toBe(false);
  });
});
