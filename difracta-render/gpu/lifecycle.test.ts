import { describe, expect, it } from "vitest";

import { rect, rotatedQuad, Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import {
  countLit,
  expectColor,
  pixel,
  quadViolations,
  samePixels,
  type PixelQuad,
} from "./pixels.ts";

/**
 * What happens across frames: a still Layer is not redrawn while its
 * picture stays, a blank one draws nothing, a Visual that throws stops
 * alone while the others go on, Blackout and Calibration Mode replace the
 * Scene, and a seeded Visual renders the same twice.
 */
const renderer = withRenderer();
const SIZE = 120;
const RED = [1, 0, 0, 1] as const;
const BLUE = [0, 0, 1, 1] as const;

describe("content skipping", () => {
  it("does not redraw a Layer whose picture has not changed, keeping the pixels", async () => {
    const frame = await renderer().render(
      new Stage().surface("wall").solid("fill", "wall", RED).document(),
      SIZE,
      SIZE,
      4,
    );
    expect(frame.reports.map((report) => report.layers.rendered)).toEqual([
      1, 0, 0, 0,
    ]);
    expect(frame.reports.map((report) => report.drew)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(frame.report.layers.running).toBe(1);
    expectColor(pixel(frame, 60, 60), [255, 0, 0]);
  });

  it("draws nothing for a Layer reporting blank", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", [1, 0, 0, 0])
        .document(),
      SIZE,
      SIZE,
      2,
    );
    expect(frame.report.layers).toEqual({
      planned: 1,
      running: 1,
      rendered: 0,
    });
    expect(countLit(frame, 8)).toBe(0);
  });
});

describe("failure isolation", () => {
  it("stops a Visual whose update throws and keeps rendering the others", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .surface("patch", rect(0.5, 0.5, 1, 1))
        .visual("steady", "wall", "test-always-redraws", {
          params: { color: RED },
        })
        .visual("boom", "patch", "test-throws", { params: { color: BLUE } })
        .document(),
      SIZE,
      SIZE,
      5,
    );
    expect(frame.reports[0]?.issues).toEqual([]);
    expect(frame.reports[0]?.layers.rendered).toBe(2);
    for (const report of frame.reports.slice(1)) {
      expect(report.issues).toEqual([
        {
          layerId: "boom",
          definition: "test-throws",
          message: "Second frame is too much.",
        },
      ]);
      expect(report.layers.rendered).toBe(1);
    }
    // Counted as running on the frame it threw, stopped from the next on.
    expect(frame.reports.map((report) => report.layers.running)).toEqual([
      2, 2, 1, 1, 1,
    ]);
    // The failed Layer's patch shows the steady one underneath.
    expectColor(pixel(frame, 90, 90), [255, 0, 0]);
    expectColor(pixel(frame, 30, 30), [255, 0, 0]);
  });
});

describe("Blackout and calibration", () => {
  it("renders all black under Blackout with no Layer running", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED)
        .blackout()
        .document(),
      SIZE,
      SIZE,
      2,
    );
    expect(countLit(frame, 0)).toBe(0);
    expect(frame.reports[0]?.drew).toBe(true);
    expect(frame.report.layers).toEqual({
      planned: 0,
      running: 0,
      rendered: 0,
    });
  });

  it("draws the calibration pattern inside the calibrated Surface's quad only", async () => {
    const quad = rotatedQuad({ x: 0.5, y: 0.5 }, 0.3, 15);
    const quadPx: PixelQuad = [
      quad.topLeft,
      quad.topRight,
      quad.bottomRight,
      quad.bottomLeft,
    ].map(({ x, y }) => [x * SIZE, y * SIZE]);
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .surface("screen", quad)
        .solid("wash", "wall", RED)
        .solid("fill", "screen", BLUE)
        .calibrate("screen")
        .document(),
      SIZE,
      SIZE,
    );
    expect(frame.report.layers.planned).toBe(0);
    // Every pixel inside the quad carries some of the pattern (its ground
    // is dim, its lines and labels bright); outside stays exactly black.
    expect(quadViolations(frame, quadPx, 2, 0)).toBe(0);
    expect(countLit(frame, 200)).toBeGreaterThan(0);
    expect(pixel(frame, 3, 3)).toEqual([0, 0, 0]);
  });
});

describe("determinism", () => {
  it("renders a seeded stateful Visual identically from two fresh compositors", async () => {
    const document = new Stage()
      .surface("wall")
      .visual("pond", "wall", "bubbles")
      .document();
    const first = await renderer().render(document, SIZE, SIZE, 30);
    const second = await renderer().render(document, SIZE, SIZE, 30);
    expect(countLit(first, 32)).toBeGreaterThan(0);
    expect(samePixels(first, second)).toBe(true);
  });
});
