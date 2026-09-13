import { describe, expect, it } from "vitest";

import {
  pixelBarLifetime,
  pixelBarPixelAlpha,
  type PixelBarEffect,
} from "./pixel-bar-motion.ts";

function litPixels(
  effect: PixelBarEffect,
  travel: number,
  trail = 3,
): readonly number[] {
  return Array.from({ length: 8 }, (_, pixelIndex) =>
    pixelBarPixelAlpha({
      direction: "forward",
      effect,
      pixelCount: 8,
      pixelIndex,
      trail,
      travel,
    }),
  )
    .map((alpha, index) => ({ alpha, index }))
    .filter(({ alpha }) => alpha > 0)
    .map(({ index }) => index);
}

describe("Pixel Bar motion", () => {
  it("keeps Scanner on exactly one complete pixel throughout its traversal", () => {
    expect(litPixels("scanner", 0.01)).toEqual([0]);
    expect(litPixels("scanner", 0.24)).toEqual([1]);
    expect(litPixels("scanner", 0.51)).toEqual([4]);
    expect(litPixels("scanner", 0.99)).toEqual([7]);
    expect(litPixels("scanner", 1)).toEqual([]);
  });

  it("moves a Comet trail beyond the final pixel before clearing", () => {
    expect(litPixels("comet", 0.99)).toEqual([4, 5, 6, 7]);
    expect(litPixels("comet", 1)).toEqual([5, 6, 7]);
    expect(litPixels("comet", 1.24)).toEqual([6, 7]);
    expect(litPixels("comet", 1.375)).toEqual([]);
  });

  it("moves both Split trails beyond their Path ends", () => {
    expect(litPixels("split", 1)).toEqual([0, 1, 2, 5, 6, 7]);
    expect(litPixels("split", 1.5)).toEqual([0, 7]);
    expect(litPixels("split", 1.75)).toEqual([]);
  });

  it("lets the returning Bounce trail drain past its starting edge", () => {
    expect(litPixels("bounce", 2)).toEqual([0, 1, 2, 3]);
    expect(litPixels("bounce", 2.24)).toEqual([0, 1]);
    expect(litPixels("bounce", 2.375)).toEqual([]);
  });

  it("ends a packet exactly where its last pixel goes dark", () => {
    for (const effect of ["scanner", "comet", "split", "bounce"] as const) {
      const end = pixelBarLifetime(effect, 8, 3);
      expect(litPixels(effect, end - 0.001).length).toBeGreaterThan(0);
      expect(litPixels(effect, end)).toEqual([]);
    }
  });
});
