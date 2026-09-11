import { describe, expect, it } from "vitest";

import { surfaceCanvasSize } from "./geometry.ts";

describe("surfaceCanvasSize", () => {
  const frontal = {
    topLeft: { x: 0.25, y: 0.25 },
    topRight: { x: 0.75, y: 0.25 },
    bottomRight: { x: 0.75, y: 0.75 },
    bottomLeft: { x: 0.25, y: 0.75 },
  };
  // A square seen from the side: tall and narrow on the projector.
  const steep = {
    topLeft: { x: 0.4, y: 0.1 },
    topRight: { x: 0.5, y: 0.2 },
    bottomRight: { x: 0.5, y: 0.8 },
    bottomLeft: { x: 0.4, y: 0.9 },
  };
  const on = { outputWidth: 1920, outputHeight: 1080 };

  it("follows the longer projected edges when the shape is automatic", () => {
    expect(
      surfaceCanvasSize({
        corners: frontal,
        ...on,
        size: null,
        renderScale: 1,
      }),
    ).toEqual({ width: 960, height: 540 });
    expect(
      surfaceCanvasSize({ corners: steep, ...on, size: null, renderScale: 1 }),
    ).toEqual({ width: 220, height: 864 });
  });

  it("stretches the shorter axis to a stated physical aspect", () => {
    expect(
      surfaceCanvasSize({
        corners: steep,
        ...on,
        size: { width: 100, height: 100 },
        renderScale: 1,
      }),
    ).toEqual({ width: 864, height: 864 });
    expect(
      surfaceCanvasSize({
        corners: frontal,
        ...on,
        size: { width: 4, height: 1 },
        renderScale: 1,
      }),
    ).toEqual({ width: 2160, height: 540 });
  });

  it("applies Render Scale and caps each axis at the texture limit", () => {
    expect(
      surfaceCanvasSize({
        corners: frontal,
        ...on,
        size: null,
        renderScale: 0.5,
      }),
    ).toEqual({ width: 480, height: 270 });
    expect(
      surfaceCanvasSize({
        corners: frontal,
        ...on,
        size: null,
        renderScale: 2,
        maxDimension: 1000,
      }),
    ).toEqual({ width: 1000, height: 563 });
  });
});
