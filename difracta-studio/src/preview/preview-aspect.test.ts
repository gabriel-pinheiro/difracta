import { describe, expect, it } from "vitest";

import { isAspectChoice, previewAspect, surfaceAspect } from "./preview-aspect";

describe("previewAspect", () => {
  it("is the Output Session's ratio, 16:9 while there is none", () => {
    expect(previewAspect("output", { width: 1024, height: 768 })).toBeCloseTo(
      4 / 3,
    );
    expect(previewAspect("output", undefined)).toBeCloseTo(16 / 9);
    expect(previewAspect("output", { width: 0, height: 0 })).toBeCloseTo(
      16 / 9,
    );
  });

  it("is the ratio picked, whatever the Output Session reports", () => {
    expect(previewAspect("4:3", { width: 1920, height: 1080 })).toBeCloseTo(
      4 / 3,
    );
    expect(previewAspect("9:16", undefined)).toBeCloseTo(9 / 16);
  });
});

describe("isAspectChoice", () => {
  it("accepts what the picker offers and nothing else", () => {
    expect(isAspectChoice("output")).toBe(true);
    expect(isAspectChoice("21:9")).toBe(true);
    expect(isAspectChoice("3:2")).toBe(false);
    expect(isAspectChoice(16 / 9)).toBe(false);
  });
});

describe("surfaceAspect", () => {
  const quad = (width: number, height: number) => ({
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height },
  });

  it("is the Surface's size when it has one", () => {
    expect(surfaceAspect({ width: 3, height: 2 }, quad(1, 1), 16 / 9)).toBe(
      1.5,
    );
  });

  it("is the shape of its mapping on the Output otherwise", () => {
    expect(surfaceAspect(null, quad(1, 1), 16 / 9)).toBeCloseTo(16 / 9);
    expect(surfaceAspect(null, quad(0.5, 1), 2)).toBeCloseTo(1);
    expect(surfaceAspect(null, quad(0.25, 0.5), 4 / 3)).toBeCloseTo(2 / 3);
  });

  it("follows the longer of opposite edges", () => {
    const keystone = {
      topLeft: { x: 0.25, y: 0 },
      topRight: { x: 0.75, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    };
    expect(surfaceAspect(null, keystone, 1)).toBeCloseTo(
      1 / Math.hypot(0.25, 1),
    );
  });

  it("is 16:9 with no mapping, or one without a shape", () => {
    expect(surfaceAspect(null, undefined, 4 / 3)).toBeCloseTo(16 / 9);
    expect(surfaceAspect(null, quad(0, 0), 4 / 3)).toBeCloseTo(16 / 9);
    expect(surfaceAspect(null, quad(1, 0), 4 / 3)).toBeCloseTo(16 / 9);
  });
});
