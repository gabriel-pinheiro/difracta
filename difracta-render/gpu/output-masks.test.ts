import { describe, expect, it } from "vitest";

import { rect, Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import {
  column,
  countLit,
  expectColor,
  mean,
  pixel,
  rampWidth,
  scanline,
} from "./pixels.ts";

/**
 * Output Masks on an Output whose full-frame Surface is lit red: an
 * exclude polygon cuts its area to black and leaves the rest, an include
 * polygon keeps only its own, a root Filter's spill past a Surface Mask is
 * cut too, feather ramps outward in pixels that are the same along both
 * axes, and the masks apply in Calibration Mode.
 */
const renderer = withRenderer();
const RED = [1, 0, 0, 1] as const;
/** The middle half of the frame on both axes. */
const middle = rect(0.25, 0.25, 0.75, 0.75);

describe("Output Masks", () => {
  const SIZE = 200;
  const inner = { x: 60, y: 60, width: 80, height: 80 };

  it("leaves an exclude Output Mask's area black and lights the rest", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle)
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

  it("lights only an include Output Mask's area", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle, { mode: "include" })
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

  it("cuts across every Surface on the Output", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("left", rect(0, 0, 0.5, 1))
        .surface("right", rect(0.5, 0, 1, 1))
        .outputMask("band", rect(0, 0.4, 1, 0.6))
        .solid("a", "left", RED)
        .solid("b", "right", RED)
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(pixel(frame, 50, 100), [0, 0, 0]);
    expectColor(pixel(frame, 150, 100), [0, 0, 0]);
    expectColor(pixel(frame, 50, 20), [255, 0, 0]);
    expectColor(pixel(frame, 150, 180), [255, 0, 0]);
  });

  it("cuts what a root Filter pushed past a Surface Mask", async () => {
    // The Surface Mask lights the left half; the Filter slides the picture
    // right by half the frame, lighting the right half the Mask kept dark.
    const stage = () =>
      new Stage()
        .surface("wall")
        .mask("half", "wall", rect(0, 0, 0.5, 1))
        .solid("fill", "wall", RED)
        .filter("slide", "test-shift-right");
    const spilled = await renderer().render(stage().document(), SIZE, SIZE);
    expectColor(pixel(spilled, 150, 100), [255, 0, 0]);
    const cut = await renderer().render(
      stage()
        .outputMask("window", rect(0.5, 0, 1, 1))
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(pixel(cut, 150, 100), [0, 0, 0]);
    expectColor(pixel(cut, 50, 100), [255, 0, 0]);
    expect(countLit(cut)).toBeLessThan(countLit(spilled) - 100 * 200 + 400);
  });

  it("feathers an exclude Output Mask outward from its edge", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle, { feather: 0.1 })
        .solid("fill", "wall", RED)
        .document(),
      SIZE,
      SIZE,
    );
    // The edge is at x = 50 and stays black with everything inside it.
    expectColor(pixel(frame, 50, 100), [0, 0, 0]);
    expectColor(pixel(frame, 100, 100), [0, 0, 0]);
    expectColor(pixel(frame, 10, 100), [255, 0, 0]);
    const outside = scanline(frame, 100, 0, 50);
    expect(rampWidth(outside)).toBeGreaterThanOrEqual(4);
    // Half of 0.1 of the mean side dilated from the edge: half lit 10 px outside it.
    const dropsAt = outside.findIndex((value) => value < 128);
    expect(Math.abs(dropsAt - 40)).toBeLessThanOrEqual(3);
  });

  it("applies in Calibration Mode, on the Output and on a Surface", async () => {
    const onOutput = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle)
        .calibrateOutput("window")
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(
      mean(onOutput, { x: 70, y: 70, width: 60, height: 60 }),
      [0, 0, 0],
    );
    // The pattern lights the rest: its border and grid lines are bright.
    expect(countLit(onOutput, 32)).toBeGreaterThan(0);
    const onSurface = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle)
        .calibrate("wall")
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(
      mean(onSurface, { x: 70, y: 70, width: 60, height: 60 }),
      [0, 0, 0],
    );
    expect(countLit(onSurface, 32)).toBeGreaterThan(0);
  });
});

describe("Output Masks on a wide frame", () => {
  const WIDTH = 640;
  const HEIGHT = 200;

  it("feathers the same number of pixels along x and y", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .outputMask("window", middle, { feather: 0.05 })
        .solid("fill", "wall", RED)
        .document(),
      WIDTH,
      HEIGHT,
    );
    // Edges at x = 160 and y = 50; the mean side is 420, so the feather is 21 px both ways.
    expectColor(pixel(frame, 160, 100), [0, 0, 0]);
    expectColor(pixel(frame, 320, 50), [0, 0, 0]);
    expectColor(pixel(frame, 20, 100), [255, 0, 0]);
    expectColor(pixel(frame, 320, 5), [255, 0, 0]);
    const alongX = scanline(frame, 100, 0, 160);
    const alongY = column(frame, 320, 0, 50);
    const dropX = 160 - alongX.findIndex((value) => value < 128);
    const dropY = 50 - alongY.findIndex((value) => value < 128);
    expect(Math.abs(dropX - 10.5)).toBeLessThanOrEqual(3);
    expect(Math.abs(dropY - 10.5)).toBeLessThanOrEqual(3);
    expect(Math.abs(rampWidth(alongX) - rampWidth(alongY))).toBeLessThanOrEqual(
      3,
    );
  });
});
