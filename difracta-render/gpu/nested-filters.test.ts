import { describe, expect, it } from "vitest";

import { rect, rotatedQuad, Stage } from "./fixtures.ts";
import { withRenderer, type Frame } from "./harness.ts";
import {
  countLit,
  expectColor,
  mean,
  pixel,
  quadViolations,
  samePixels,
  type PixelQuad,
} from "./pixels.ts";

/**
 * Filter Layers inside a Visual Layer: they transform that Layer's picture
 * in its Target, the right way up, following the Surface's mapping and
 * cut by its Masks, before opacity and blend mode; a root Filter still
 * crosses Surfaces; a Layer without a running nested Filter renders as it
 * always did; the chain reruns only when something changed.
 */
const renderer = withRenderer();
const SIZE = 128;
const RED = [1, 0, 0, 1] as const;
const BLUE = [0, 0, 1, 1] as const;

function render(stage: Stage, frames = 1): Promise<Frame> {
  return renderer().render(stage.document(), SIZE, SIZE, frames);
}

const centre = (frame: Frame) => pixel(frame, SIZE / 2, SIZE / 2);
const upper = (frame: Frame) => pixel(frame, SIZE / 2, SIZE / 4);
const lower = (frame: Frame) => pixel(frame, SIZE / 2, (SIZE * 3) / 4);

/** The scaled shader at full resolution: red on top, blue below. */
const halves = (
  stage: Stage,
  id: string,
  surface: string,
  resolution = 1,
): Stage =>
  stage.visual(id, surface, "test-scaled-shader", {
    params: { color: RED, renderResolution: resolution },
  });

describe("a Visual Layer's Filters", () => {
  it("see the picture the right way up, through every kind of source", async () => {
    // Mirror up keeps the bottom half: the blue one, whatever the Visual.
    for (const resolution of [1, 0.5]) {
      const frame = await render(
        halves(new Stage().surface("wall"), "clip", "wall", resolution).nested(
          "mirror",
          "clip",
          "test-mirror-up",
        ),
      );
      expectColor(upper(frame), [0, 0, 255]);
      expectColor(lower(frame), [0, 0, 255]);
      expect(frame.report.issues).toEqual([]);
    }
    const plain = await render(
      halves(new Stage().surface("wall"), "clip", "wall"),
    );
    expectColor(upper(plain), [255, 0, 0]);
    expectColor(lower(plain), [0, 0, 255]);
  });

  it("mirror within a skewed Surface, following its homography", async () => {
    const tilted = rotatedQuad({ x: 0.5, y: 0.5 }, 0.3, 20);
    const quad: PixelQuad = [
      tilted.topLeft,
      tilted.topRight,
      tilted.bottomRight,
      tilted.bottomLeft,
    ].map(({ x, y }) => [x * SIZE, y * SIZE]);
    const frame = await render(
      halves(new Stage().surface("wall", tilted), "clip", "wall").nested(
        "mirror",
        "clip",
        "test-mirror-up",
      ),
    );
    // Lit exactly inside the quad, and blue throughout: the top half of the
    // Target took the bottom's picture, inside the mapping.
    expect(quadViolations(frame, quad)).toBe(0);
    expectColor(centre(frame), [0, 0, 255]);
    expectColor(pixel(frame, SIZE / 2, SIZE / 2 - 20), [0, 0, 255]);
    expect(countLit(frame, 128)).toBeGreaterThan(0);
    for (let y = 0; y < SIZE; y += 1)
      for (let x = 0; x < SIZE; x += 1) expect(pixel(frame, x, y)[0]).toBe(0);
  });

  it("stay inside the Surface and its Masks, while a root Filter crosses Surfaces", async () => {
    const left = rect(0, 0, 0.5, 1);
    const hole = rect(0.25, 0.25, 0.75, 0.75);
    const nested = await render(
      new Stage()
        .surface("wall", left)
        .mask("hole", "wall", hole, { mode: "exclude" })
        .solid("clip", "wall", RED)
        .nested("shift", "clip", "test-shift-right"),
    );
    // Shifted within the Target the clip stays solid red on its half, the
    // Mask's hole stays dark and the other half of the frame stays black.
    expectColor(pixel(nested, 8, SIZE / 2), [255, 0, 0]);
    expectColor(
      mean(nested, { x: 20, y: 40, width: 24, height: 48 }),
      [0, 0, 0],
    );
    expectColor(pixel(nested, (SIZE * 3) / 4, SIZE / 2), [0, 0, 0]);
    const root = await render(
      new Stage()
        .surface("wall", left)
        .solid("clip", "wall", RED)
        .filter("shift", "test-shift-right"),
    );
    expectColor(pixel(root, (SIZE * 3) / 4, SIZE / 2), [255, 0, 0]);
  });

  it("apply before opacity, blend mode and mix", async () => {
    const faded = await render(
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED, { opacity: 0.5 })
        .nested("invert", "clip", "test-invert"),
    );
    // Cyan from the pass, at half.
    expectColor(centre(faded), [0, 128, 128]);
    const mixed = await render(
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED)
        .nested("invert", "clip", "test-invert", 0.5),
    );
    expectColor(centre(mixed), [128, 128, 128]);
    const additive = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", RED)
        .solid("clip", "wall", BLUE, { blendMode: "additive" })
        .nested("halve", "clip", "test-halve"),
    );
    expectColor(centre(additive), [255, 0, 128]);
  });

  it("run bottom first, the lower row of the navigator before the upper", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED)
        .nested("invert", "clip", "test-invert")
        .nested("halve", "clip", "test-halve"),
    );
    expectColor(centre(frame), [0, 128, 128]);
    expect(frame.report.filters).toEqual({
      planned: 2,
      running: 2,
      executed: 2,
    });
  });

  it("count with the root Filters and leave a Layer without one on its plain path", async () => {
    const stage = () =>
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED)
        .solid("above", "wall", BLUE, { opacity: 0.5 })
        .filter("root", "test-halve");
    const plain = await render(stage());
    const idle = await render(stage().nested("off", "clip", "test-invert", 0));
    expect(samePixels(plain, idle)).toBe(true);
    expect(idle.report.filters).toEqual({
      planned: 1,
      running: 1,
      executed: 1,
    });
    const both = await render(stage().nested("on", "clip", "test-invert"));
    expect(both.report.filters).toEqual({
      planned: 2,
      running: 2,
      executed: 2,
    });
    // Cyan, half blue over it, then everything halved.
    expectColor(centre(both), [0, 64, 128]);
  });

  it("rerun only when the picture or a pass changed, and keep the result meanwhile", async () => {
    const still = await render(
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED)
        .nested("invert", "clip", "test-invert"),
      4,
    );
    expect(still.reports.map((report) => report.filters.executed)).toEqual([
      1, 0, 0, 0,
    ]);
    expect(still.reports.map((report) => report.drew)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expectColor(centre(still), [0, 255, 255]);
    const moving = await render(
      new Stage()
        .surface("wall")
        .visual("clip", "wall", "test-always-redraws", {
          params: { color: RED },
        })
        .nested("invert", "clip", "test-invert"),
      3,
    );
    expect(moving.reports.map((report) => report.filters.executed)).toEqual([
      1, 1, 1,
    ]);
    expectColor(centre(moving), [0, 255, 255]);
  });

  it("stay planned with a hidden Layer, which draws nothing", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("clip", "wall", RED, { opacity: 0 })
        .nested("invert", "clip", "test-invert"),
      2,
    );
    expect(countLit(frame, 8)).toBe(0);
    expect(frame.report.filters).toEqual({
      planned: 1,
      running: 0,
      executed: 0,
    });
  });
});
