import { describe, expect, it } from "vitest";

import { rotatedQuad, Stage } from "./fixtures.ts";
import { withRenderer, type Frame } from "./harness.ts";
import {
  column,
  countLit,
  expectColor,
  pixel,
  quadViolations,
  rampWidth,
  samePixels,
  scanline,
  type PixelQuad,
} from "./pixels.ts";

/**
 * Where a Surface lands and how its edge looks: a Layer lights exactly its
 * Surface's quad, a full-frame Surface lights every pixel, and the edge
 * of a rotated quad fades across one to three pixels whether the Layers
 * draw straight to the screen or through the Filter chain.
 */
const renderer = withRenderer();
const SIZE = 200;
const RED = [1, 0, 0, 1] as const;

/** A quad tilted 20°, its sides 120 px, centred in a 200 px frame. */
const tilted = rotatedQuad({ x: 0.5, y: 0.5 }, 0.3, 20);
const tiltedPx: PixelQuad = [
  tilted.topLeft,
  tilted.topRight,
  tilted.bottomRight,
  tilted.bottomLeft,
].map(({ x, y }) => [x * SIZE, y * SIZE]);

function render(stage: Stage, frames = 1): Promise<Frame> {
  return renderer().render(stage.document(), SIZE, SIZE, frames);
}

/**
 * The ramps met by rows and columns through the quad's middle, one edge
 * on each side of the centre: twenty crossings of the tilted edges.
 */
function edgeRamps(frame: Frame): readonly number[] {
  const middle = SIZE / 2;
  const ramps: number[] = [];
  for (const line of [80, 90, 100, 110, 120])
    ramps.push(
      rampWidth(scanline(frame, line, 0, middle)),
      rampWidth(scanline(frame, line, middle, SIZE - 1)),
      rampWidth(column(frame, line, 0, middle)),
      rampWidth(column(frame, line, middle, SIZE - 1)),
    );
  return ramps;
}

/**
 * A one-pixel fade: no crossing wider than three pixels, and nearly every
 * crossing shows a pixel in between (a centre can land so close to an end
 * of the fade that it rounds to the background or the fill).
 */
function expectFeathered(frame: Frame): void {
  const ramps = edgeRamps(frame);
  for (const ramp of ramps) expect(ramp).toBeLessThanOrEqual(3);
  expect(ramps.filter((ramp) => ramp >= 1).length).toBeGreaterThanOrEqual(
    ramps.length * 0.75,
  );
}

describe("mapping and coverage", () => {
  it("lights exactly the rotated quad a canvas Layer is mapped to", async () => {
    const frame = await render(
      new Stage().surface("quad", tilted).solid("fill", "quad", RED),
    );
    expectColor(pixel(frame, 100, 100), [255, 0, 0]);
    expectColor(pixel(frame, 3, 3), [0, 0, 0]);
    expectColor(pixel(frame, 196, 196), [0, 0, 0]);
    expect(quadViolations(frame, tiltedPx)).toBe(0);
  });

  it("lights exactly the rotated quad a shader Layer is mapped to", async () => {
    const frame = await render(
      new Stage()
        .surface("quad", tilted)
        .visual("fill", "quad", "test-flat-shader", { params: { color: RED } }),
    );
    expect(frame.report.shaders.rendered).toBe(1);
    expectColor(pixel(frame, 100, 100), [255, 0, 0]);
    expect(quadViolations(frame, tiltedPx)).toBe(0);
  });

  it("lights every pixel for a full-frame Surface", async () => {
    const frame = await render(
      new Stage().surface("wall").solid("fill", "wall", RED),
    );
    expect(countLit(frame, 250)).toBe(SIZE * SIZE);
    expectColor(pixel(frame, 0, 0), [255, 0, 0]);
    expectColor(pixel(frame, SIZE - 1, SIZE - 1), [255, 0, 0]);
  });
});

describe("Surface edge antialiasing", () => {
  const straight = new Stage()
    .surface("quad", tilted)
    .solid("fill", "quad", RED);
  const filtered = new Stage()
    .surface("quad", tilted)
    .solid("fill", "quad", RED)
    .filter("pass", "test-passthrough", 0.5);

  it("fades a rotated edge over one to three pixels drawn straight to the screen", async () => {
    const frame = await render(straight);
    expect(frame.report.filters.executed).toBe(0);
    expectFeathered(frame);
  });

  it("fades the same edge identically through the Filter chain", async () => {
    const frame = await render(filtered);
    expect(frame.report.filters.executed).toBe(1);
    expectColor(pixel(frame, 100, 100), [255, 0, 0]);
    expectFeathered(frame);
    expect(quadViolations(frame, tiltedPx)).toBe(0);
    expect(samePixels(frame, await render(straight))).toBe(true);
  });

  it("fades a shader Layer's edge the same way", async () => {
    const frame = await render(
      new Stage()
        .surface("quad", tilted)
        .visual("fill", "quad", "test-flat-shader", { params: { color: RED } })
        .filter("pass", "test-passthrough", 0.5),
    );
    expect(frame.report.filters.executed).toBe(1);
    expectFeathered(frame);
  });
});
