import { describe, expect, it } from "vitest";

import { rect, Stage } from "./fixtures.ts";
import { withRenderer, type Frame } from "./harness.ts";
import { countLit, expectColor, pixel } from "./pixels.ts";

/**
 * How Layers combine and what Filters do to the frame below them: opacity
 * mixes, additive adds, an invisible Layer changes nothing, a Filter
 * transforms the accumulated frame by its mix, passes run in stack order,
 * and a pass with no input never runs.
 */
const renderer = withRenderer();
const SIZE = 64;
const RED = [1, 0, 0, 1] as const;
const GREEN = [0, 1, 0, 1] as const;
const BLUE = [0, 0, 1, 1] as const;

function render(stage: Stage): Promise<Frame> {
  return renderer().render(stage.document(), SIZE, SIZE);
}

const centre = (frame: Frame) => pixel(frame, SIZE / 2, SIZE / 2);

describe("Layer stacking, opacity and blend", () => {
  it("mixes a half-opaque Layer over the one below", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", RED)
        .solid("above", "wall", BLUE, { opacity: 0.5 }),
    );
    expectColor(centre(frame), [128, 0, 128]);
    expect(frame.report.layers).toEqual({
      planned: 2,
      running: 2,
      rendered: 2,
    });
  });

  it("adds an additive Layer to the one below", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", RED)
        .solid("above", "wall", GREEN, { blendMode: "additive" }),
    );
    expectColor(centre(frame), [255, 255, 0]);
    const half = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", [0.5, 0, 0, 1])
        .solid("above", "wall", [0.25, 0, 0, 1], { blendMode: "additive" }),
    );
    expectColor(centre(half), [191, 0, 0]);
  });

  it("draws nothing for a Layer at opacity zero, which is planned but not running", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", RED)
        .solid("above", "wall", BLUE, { opacity: 0 }),
    );
    expectColor(centre(frame), [255, 0, 0]);
    expect(frame.report.layers).toEqual({
      planned: 2,
      running: 1,
      rendered: 1,
    });
  });

  it("keeps each Layer on its own Surface", async () => {
    const frame = await render(
      new Stage()
        .surface("left", rect(0, 0, 0.5, 1))
        .surface("right", rect(0.5, 0, 1, 1))
        .solid("a", "left", RED)
        .solid("b", "right", BLUE),
    );
    expectColor(pixel(frame, 16, 32), [255, 0, 0]);
    expectColor(pixel(frame, 48, 32), [0, 0, 255]);
  });
});

describe("Filter chain", () => {
  it("inverts a solid Layer through an inverting Filter", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED)
        .filter("invert", "test-invert"),
    );
    expectColor(centre(frame), [0, 255, 255]);
    expect(frame.report.filters).toEqual({
      planned: 1,
      running: 1,
      executed: 1,
    });
  });

  it("blends the pass with its input by the Layer's mix", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED)
        .filter("invert", "test-invert", 0.5),
    );
    expectColor(centre(frame), [128, 128, 128]);
  });

  it("runs the passes in stack order", async () => {
    const invertThenHalve = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED)
        .filter("invert", "test-invert")
        .filter("halve", "test-halve"),
    );
    expectColor(centre(invertThenHalve), [0, 128, 128]);
    const halveThenInvert = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED)
        .filter("halve", "test-halve")
        .filter("invert", "test-invert"),
    );
    expectColor(centre(halveThenInvert), [128, 255, 255]);
    expect(halveThenInvert.report.filters.executed).toBe(2);
  });

  it("skips a pass over Layers that are all blank, leaving the frame as it is", async () => {
    // Inverting the empty frame would turn it white, so the black frame
    // shows the pass did not run.
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", [1, 0, 0, 0])
        .filter("invert", "test-invert"),
    );
    expect(countLit(frame, 8)).toBe(0);
    expect(frame.report.filters).toEqual({
      planned: 1,
      running: 1,
      executed: 0,
    });
  });

  it("does not plan a pass over Layers that are all hidden", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("fill", "wall", RED, { opacity: 0 })
        .filter("invert", "test-invert"),
    );
    expect(countLit(frame, 8)).toBe(0);
    expect(frame.report.filters).toEqual({
      planned: 0,
      running: 0,
      executed: 0,
    });
  });

  it("transforms only what lies below the Filter", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", RED)
        .filter("invert", "test-invert")
        .solid("above", "wall", BLUE, { opacity: 0.5 }),
    );
    // Cyan from the pass, then half blue over it.
    expectColor(centre(frame), [0, 128, 255]);
  });
});
