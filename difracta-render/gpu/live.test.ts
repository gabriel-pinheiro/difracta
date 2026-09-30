import { readFile } from "node:fs/promises";

import { SAMPLE_IMAGE, sampleMediaRoot } from "@difracta/visuals";
import { describe, expect, it } from "vitest";

import { Stage } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import { expectColor, pixel } from "./pixels.ts";

const renderer = withRenderer();

/**
 * The picture shared is the sample one, 128 by 72: black, a white ring of
 * radius 20 to 28 about the centre and a white bar at x 6..38, y 6..14. It
 * reaches the Surface through a peer connection, so its colours are an
 * encoder's and its edges a little soft: pixels are read well inside a
 * shape, with a tolerance.
 */
const bytes = await readFile(new URL(SAMPLE_IMAGE, sampleMediaRoot));
const shares = {
  screen: `data:image/png;base64,${bytes.toString("base64")}`,
};

const WHITE = [255, 255, 255] as const;
const BLACK = [0, 0, 0] as const;
const RED = [255, 0, 0] as const;
const SOFT = 40;

const live = (params: Record<string, unknown> = {}) =>
  new Stage()
    .share("screen")
    .surface("wall")
    .solid("under", "wall", [1, 0, 0, 1])
    .visual("live", "wall", "live", { params: { media: "screen", ...params } });

const render = (stage: Stage, width: number, height: number) =>
  renderer().render(
    stage.document(),
    width,
    height,
    20,
    undefined,
    undefined,
    shares,
  );

describe("Live pixels", () => {
  it("shows the share over the Surface, rows top first and opaque", async () => {
    const frame = await render(live({ fit: "stretch" }), 128, 72);
    expectColor(pixel(frame, 88, 36), WHITE, SOFT); // on the ring
    expectColor(pixel(frame, 64, 36), BLACK, SOFT); // inside it: the picture's black, not the red under
    expectColor(pixel(frame, 22, 10), WHITE, SOFT); // the bar, top-left
    expectColor(pixel(frame, 22, 62), BLACK, SOFT); // not mirrored to the bottom
    expect(frame.report.issues).toEqual([]);
    expect(frame.report.shares).toEqual({ viewed: 1, connected: 1 });
  }, 30_000);

  it("cuts the picture down to the crop and stretches what is left", async () => {
    // Inside the bar, which is x 6..38, y 6..14 of the picture.
    const frame = await render(
      live({
        fit: "stretch",
        cropLeft: 0.0625,
        cropRight: 0.72,
        cropTop: 0.1,
        cropBottom: 0.82,
      }),
      128,
      72,
    );
    for (const [x, y] of [
      [10, 8],
      [64, 36],
      [118, 64],
    ] as const)
      expectColor(pixel(frame, x, y), WHITE, SOFT);
  }, 30_000);

  it("fits what the crop leaves, not the whole picture", async () => {
    // The left half, 64 by 72, contained in 128 by 72: a band 64 wide in the middle.
    const frame = await render(
      live({ fit: "contain", cropRight: 0.5 }),
      128,
      72,
    );
    expectColor(pixel(frame, 10, 36), RED); // left of the band: the Layer under
    expectColor(pixel(frame, 118, 36), RED);
    expectColor(pixel(frame, 32 + 22, 10), WHITE, SOFT); // the bar
    expectColor(pixel(frame, 32 + 40, 36), WHITE, SOFT); // the ring's left side
    expectColor(pixel(frame, 32 + 58, 36), BLACK, SOFT); // inside the ring
  }, 30_000);

  it("is blank while nobody shares", async () => {
    const stage = live();
    const frame = await renderer().render(
      stage.document(),
      32,
      18,
      5,
      undefined,
      undefined,
      {},
    );
    expectColor(pixel(frame, 16, 9), RED);
    expect(frame.report.shares).toEqual({ viewed: 1, connected: 0 });
  }, 30_000);
});
