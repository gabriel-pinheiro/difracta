import { describe, expect, it } from "vitest";

import { rect, Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import { countLit, expectColor, mean, pixel } from "./pixels.ts";

/**
 * A Layer on a Region lights only the Region's part of its Surface, for a
 * canvas Visual and a shader Visual alike; the Surface's Masks still cut it
 * where they fall; and on a Surface mapped to part of the frame the Region
 * lands inside the Surface, where its rectangle says.
 */
const renderer = withRenderer();
const RED = [1, 0, 0, 1] as const;
const SIZE = 200;
/** The middle half of the frame on both axes, where the Region lands. */
const inner = { x: 60, y: 60, width: 80, height: 80 };
const middle = {
  topLeft: { x: 0.25, y: 0.25 },
  bottomRight: { x: 0.75, y: 0.75 },
};

describe("Regions", () => {
  it("lights only the Region with a canvas Visual", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .region("panel", "wall", middle.topLeft, middle.bottomRight)
        .solid("fill", "panel", RED)
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

  it("lights only the Region with a shader Visual", async () => {
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .region("panel", "wall", middle.topLeft, middle.bottomRight)
        .visual("fill", "panel", "test-flat-shader", { params: { color: RED } })
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(mean(frame, inner), [255, 0, 0]);
    expectColor(pixel(frame, 10, 10), [0, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(100 * 100 - 400);
    expect(lit).toBeLessThan(100 * 100 + 400);
  });

  it("is cut by the Surface's Masks where they fall on it", async () => {
    // An exclude Mask over the Region's left half, in Surface Space.
    const frame = await renderer().render(
      new Stage()
        .surface("wall")
        .region("panel", "wall", middle.topLeft, middle.bottomRight)
        .mask("hole", "wall", rect(0, 0, 0.5, 1), { mode: "exclude" })
        .solid("fill", "panel", RED)
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(pixel(frame, 75, 100), [0, 0, 0]);
    expectColor(pixel(frame, 125, 100), [255, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(50 * 100 - 300);
    expect(lit).toBeLessThan(50 * 100 + 300);
  });

  it("lands inside a Surface mapped to part of the frame", async () => {
    // The Surface covers the right half of the frame; the Region is its
    // bottom half, so the lit area is the frame's bottom-right quarter.
    const frame = await renderer().render(
      new Stage()
        .surface("wall", rect(0.5, 0, 1, 1))
        .region("panel", "wall", { x: 0, y: 0.5 }, { x: 1, y: 1 })
        .solid("fill", "panel", RED)
        .document(),
      SIZE,
      SIZE,
    );
    expectColor(
      mean(frame, { x: 110, y: 110, width: 80, height: 80 }),
      [255, 0, 0],
    );
    expectColor(pixel(frame, 150, 50), [0, 0, 0]);
    expectColor(pixel(frame, 50, 150), [0, 0, 0]);
    const lit = countLit(frame);
    expect(lit).toBeGreaterThan(100 * 100 - 400);
    expect(lit).toBeLessThan(100 * 100 + 400);
  });
});
