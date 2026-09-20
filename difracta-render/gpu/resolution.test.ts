import { describe, expect, it } from "vitest";

import { Stage } from "./fixtures.ts";
import { withRenderer, type Frame } from "./harness.ts";
import { expectColor, pixel } from "./pixels.ts";

/**
 * A shader Visual rendering below full resolution: its buffer lands upright
 * where the full-resolution picture would, takes the Layer's opacity and
 * blend mode like a canvas, and is not redrawn on a frame nothing changed.
 */
const renderer = withRenderer();
const SIZE = 64;
const RED = [1, 0, 0, 1] as const;
const GREEN = [0, 1, 0, 1] as const;

function render(stage: Stage, frames = 1): Promise<Frame> {
  return renderer().render(stage.document(), SIZE, SIZE, frames);
}

const top = (frame: Frame) => pixel(frame, SIZE / 2, SIZE / 4);
const bottom = (frame: Frame) => pixel(frame, SIZE / 2, (SIZE * 3) / 4);

describe("a shader Visual below full resolution", () => {
  it("lands upright where the full-resolution picture does", async () => {
    for (const resolution of [0.5, 1]) {
      const frame = await render(
        new Stage()
          .surface("wall")
          .visual("scaled", "wall", "test-scaled-shader", {
            params: { color: RED, renderResolution: resolution },
          }),
      );
      expectColor(top(frame), [255, 0, 0]);
      expectColor(bottom(frame), [0, 0, 255]);
      expect(frame.report.issues).toEqual([]);
    }
  });

  it("takes the Layer's opacity and blend mode like a canvas", async () => {
    const mixed = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", GREEN)
        .visual("scaled", "wall", "test-scaled-shader", {
          opacity: 0.5,
          params: { color: RED },
        }),
    );
    expectColor(top(mixed), [128, 128, 0]);
    const added = await render(
      new Stage()
        .surface("wall")
        .solid("below", "wall", GREEN)
        .visual("scaled", "wall", "test-scaled-shader", {
          blendMode: "additive",
          params: { color: RED },
        }),
    );
    expectColor(top(added), [255, 255, 0]);
    expectColor(bottom(added), [0, 255, 255]);
  });

  it("draws no new frame while nothing changed", async () => {
    const frame = await render(
      new Stage()
        .surface("wall")
        .visual("scaled", "wall", "test-scaled-shader", {
          params: { color: RED },
        }),
      3,
    );
    expect(frame.reports.map((report) => report.drew)).toEqual([
      true,
      false,
      false,
    ]);
    expectColor(top(frame), [255, 0, 0]);
  });
});
