import { describe, expect, it } from "vitest";

import { maskTextureSize } from "../src/index.ts";
import { rect, Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import {
  column,
  countLit,
  expectColor,
  halfCrossing,
  mean,
  pixel,
  rampWidth,
  scanline,
} from "./pixels.ts";

/**
 * Masks on a full-frame Surface lit red: an exclude polygon darkens its
 * area, an include polygon lights only its own, feather ramps over
 * several pixels, and a Surface wider than it is tall gets a texture of
 * the same proportion that still lands the polygon where its points say.
 */
const renderer = withRenderer();
const RED = [1, 0, 0, 1] as const;
/** The middle half of the Surface on both axes. */
const middle = rect(0.25, 0.25, 0.75, 0.75);

describe("Masks", () => {
  const SIZE = 200;
  const inner = { x: 60, y: 60, width: 80, height: 80 };

  it("leaves an exclude Mask's polygon black and lights the rest", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .mask("hole", "wall", middle, { mode: "exclude" })
        .solid("fill", "wall", RED)
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(mean(frame, inner), [0, 0, 0]);
    expectColor(pixel(frame, 10, 10), [255, 0, 0]);
    expectColor(pixel(frame, 190, 100), [255, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(SIZE * SIZE - 100 * 100 - 400);
    expect(lit).toBeLessThan(SIZE * SIZE - 100 * 100 + 400);
  });

  it("lights only an include Mask's polygon", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .mask("window", "wall", middle)
        .solid("fill", "wall", RED)
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(mean(frame, inner), [255, 0, 0]);
    expectColor(pixel(frame, 10, 10), [0, 0, 0]);
    expectColor(pixel(frame, 190, 100), [0, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(100 * 100 - 400);
    expect(lit).toBeLessThan(100 * 100 + 400);
  });

  it("feathers an include Mask inward over several pixels", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .mask("window", "wall", middle, { feather: 0.1 })
        .solid("fill", "wall", RED)
        .document(),
      SIZE,
      SIZE,
    );
    // Inward only: outside the polygon stays black, the centre is fully lit.
    expectColor(pixel(frame, 45, 100), [0, 0, 0]);
    expectColor(pixel(frame, 100, 100), [255, 0, 0]);
    const ramp = rampWidth(scanline(frame, 100, 50, 100));
    expect(ramp).toBeGreaterThanOrEqual(4);
    expect(ramp).toBeLessThan(50);
  });
});

describe("Masks on a wide Surface", () => {
  const WIDTH = 640;
  const HEIGHT = 200;
  const corners = rect(0, 0, 1, 1);

  it("gets a texture as wide as the Surface's extent, not square", () => {
    expect(
      maskTextureSize({
        corners,
        outputWidth: WIDTH,
        outputHeight: HEIGHT,
        maxDimension: 4096,
      }),
    ).toEqual({ width: 640, height: 256 });
  });

  it("lands a rectangle Mask's edges where its points say on both axes", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .mask("window", "wall", middle)
        .solid("fill", "wall", RED)
        .document(),
      WIDTH,
      HEIGHT,
    );
    // Edges at x = 160 and 480, y = 50 and 150.
    expectColor(pixel(frame, 157, 100), [0, 0, 0]);
    expectColor(pixel(frame, 163, 100), [255, 0, 0]);
    expectColor(pixel(frame, 477, 100), [255, 0, 0]);
    expectColor(pixel(frame, 483, 100), [0, 0, 0]);
    expectColor(pixel(frame, 320, 47), [0, 0, 0]);
    expectColor(pixel(frame, 320, 53), [255, 0, 0]);
    expectColor(pixel(frame, 320, 147), [255, 0, 0]);
    expectColor(pixel(frame, 320, 153), [0, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(320 * 100 - 900);
    expect(lit).toBeLessThan(320 * 100 + 900);
  });

  it("feathers to the same Surface Space fraction along x and y", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .mask("window", "wall", middle, { feather: 0.1 })
        .solid("fill", "wall", RED)
        .document(),
      WIDTH,
      HEIGHT,
    );
    expectColor(pixel(frame, 320, 100), [255, 0, 0]);
    expectColor(pixel(frame, 150, 100), [0, 0, 0]);
    expectColor(pixel(frame, 320, 45), [0, 0, 0]);
    const alongX = scanline(frame, 100, 0, 320);
    const alongY = column(frame, 320, 0, 100);
    expect(rampWidth(alongX)).toBeGreaterThanOrEqual(4);
    expect(rampWidth(alongY)).toBeGreaterThanOrEqual(4);
    // Feather is a fraction of Surface Space: half of 0.1 eroded from the
    // edge at 0.25, blurred both ways, reaches half at 0.30 of the Surface
    // on either axis, so the wide Mask texture stretches neither side.
    expect(Math.abs(halfCrossing(alongX) / WIDTH - 0.3)).toBeLessThan(0.015);
    expect(Math.abs(halfCrossing(alongY) / HEIGHT - 0.3)).toBeLessThan(0.015);
    // In pixels each ramp follows the side it crosses: wider along the wide side.
    expect(rampWidth(alongX)).toBeGreaterThan(rampWidth(alongY));
  });
});
