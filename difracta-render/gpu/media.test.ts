import { readFile } from "node:fs/promises";

import { SAMPLE_IMAGE, SAMPLE_VIDEO, sampleMediaRoot } from "@difracta/visuals";
import { describe, expect, it } from "vitest";

import { Stage, rect } from "./fixtures.ts";
import { withRenderer } from "./harness.ts";
import { expectColor, pixel } from "./pixels.ts";

const renderer = withRenderer();

/**
 * The sample picture is 128 by 72: black, a white ring of radius 20 to 28
 * about the centre and a white bar at x 6..38, y 6..14. The sample clip is
 * the same size, with a white square at x 8..40, y 24..48 on its first
 * frame, crossing to the right.
 */
async function dataUrl(file: string, type: string): Promise<string> {
  const bytes = await readFile(new URL(file, sampleMediaRoot));
  return `data:${type};base64,${bytes.toString("base64")}`;
}

const media = {
  pic: await dataUrl(SAMPLE_IMAGE, "image/png"),
  clip: await dataUrl(SAMPLE_VIDEO, "video/webm"),
};

const WHITE = [255, 255, 255] as const;
const BLACK = [0, 0, 0] as const;
const RED = [255, 0, 0] as const;

describe("Image pixels", () => {
  it("stretches the picture over the Surface, rows top first, through the Tint", async () => {
    const stage = new Stage()
      .media("pic", "sample.png")
      .surface("wall")
      .visual("image", "wall", "image", { params: { media: "pic" } });
    const frame = await renderer().render(stage.document(), 128, 72, 10, media);
    expectColor(pixel(frame, 88, 36), WHITE); // on the ring
    expectColor(pixel(frame, 64, 36), BLACK); // inside it
    expectColor(pixel(frame, 20, 10), WHITE); // the bar, top-left
    expectColor(pixel(frame, 20, 62), BLACK); // not mirrored to the bottom
    expectColor(pixel(frame, 2, 2), BLACK);
    expect(frame.report.issues).toEqual([]);
    const tinted = new Stage()
      .media("pic", "sample.png")
      .surface("wall")
      .visual("image", "wall", "image", {
        params: { media: "pic", tint: [1, 0, 0, 1] },
      });
    const red = await renderer().render(tinted.document(), 128, 72, 10, media);
    expectColor(pixel(red, 88, 36), RED);
  });

  it("contains the picture, leaving the bands clear, and covers by cropping", async () => {
    // A square Surface: the wide picture spans its width in a band of 81 rows.
    const contained = new Stage()
      .media("pic", "sample.png")
      .surface("wall")
      .solid("under", "wall", [1, 0, 0, 1])
      .visual("image", "wall", "image", {
        params: { media: "pic", fit: "contain" },
      });
    const frame = await renderer().render(
      contained.document(),
      144,
      144,
      10,
      media,
    );
    expectColor(pixel(frame, 72, 10), RED); // above the band: the Layer under shows
    expectColor(pixel(frame, 72, 134), RED);
    expectColor(pixel(frame, 72, 72), BLACK); // the picture's opaque black
    expectColor(pixel(frame, 72 + 27, 72), WHITE); // the ring, scaled by 144/128
    const covered = new Stage()
      .media("pic", "sample.png")
      .surface("wall")
      .solid("under", "wall", [1, 0, 0, 1])
      .visual("image", "wall", "image", {
        params: { media: "pic", fit: "cover" },
      });
    const cover = await renderer().render(
      covered.document(),
      144,
      144,
      10,
      media,
    );
    expectColor(pixel(cover, 72, 10), BLACK); // full height: nothing red anywhere
    expectColor(pixel(cover, 10, 20), WHITE); // the bar's right part, at the left edge
    expectColor(pixel(cover, 72, 72), BLACK);
    expectColor(pixel(cover, 72 + 48, 72), WHITE); // the ring, scaled by 144/72
  });

  it("draws a Surface on a corner of the frame at the Surface's aspect", async () => {
    const stage = new Stage()
      .media("pic", "sample.png")
      .surface("tv", rect(0.5, 0.5, 1, 1))
      .visual("image", "tv", "image", { params: { media: "pic" } });
    const frame = await renderer().render(
      stage.document(),
      256,
      144,
      10,
      media,
    );
    expectColor(pixel(frame, 60, 40), BLACK); // outside the Surface
    expectColor(pixel(frame, 128 + 88, 72 + 36), WHITE); // the ring, in the quarter
    expectColor(pixel(frame, 128 + 20, 72 + 10), WHITE); // the bar
  });
});

describe("Video pixels", () => {
  it("shows the first frame of a clip waiting for Play", async () => {
    const stage = new Stage()
      .media("clip", "sample.webm")
      .surface("wall")
      .visual("video", "wall", "video", {
        params: { media: "clip", autoplay: false, hideOnStop: false },
      });
    const frame = await renderer().render(stage.document(), 128, 72, 10, media);
    expectColor(pixel(frame, 24, 36), WHITE, 24); // the square, VP9 at its softest
    expectColor(pixel(frame, 100, 36), BLACK, 24);
    expectColor(pixel(frame, 24, 8), BLACK, 24);
    expect(frame.report.issues).toEqual([]);
  });

  it("is dark while stopped with Hide on Stop", async () => {
    const stage = new Stage()
      .media("clip", "sample.webm")
      .surface("wall")
      .visual("video", "wall", "video", {
        params: { media: "clip", autoplay: false },
      });
    // Nothing ever draws, so the paced run gives up after its wait.
    const frame = await renderer().render(stage.document(), 32, 18, 5, media);
    expectColor(pixel(frame, 6, 9), BLACK);
    expect(frame.report.shaders.rendered).toBe(0);
  }, 30_000);
});
