import { describe, expect, it } from "vitest";

import { catalog, layer, packs, run, stage, video } from "./video-fixture.ts";
import { targetVideoRows, videoRenditions } from "./video-resolution.ts";

const frame = { outputId: "out", width: 1920, height: 1080 };

describe("targetVideoRows", () => {
  it("is the rows of the video that cover the Target on this Output", () => {
    let document = layer(stage(), "l_full", "full", {});
    document = layer(document, "l_wall", "wall", {});
    expect(targetVideoRows(document, "l_full", 16 / 9, frame)).toBe(1080);
    // 480×540 px: a 16:9 video covering it is 540 rows tall.
    expect(targetVideoRows(document, "l_wall", 16 / 9, frame)).toBe(540);
    // A portrait video covering the full frame needs its width first.
    expect(targetVideoRows(document, "l_full", 9 / 16, frame)).toBeCloseTo(
      1920 / (9 / 16),
    );
  });

  it("is undefined for a Layer with no Target or one not on this Output", () => {
    let document = layer(stage(), "l_none", null, {});
    document = layer(document, "l_wall", "wall", {});
    expect(targetVideoRows(document, "l_none", 16 / 9, frame)).toBeUndefined();
    expect(
      targetVideoRows(document, "l_wall", 16 / 9, {
        ...frame,
        outputId: "other",
      }),
    ).toBeUndefined();
  });
});

describe("videoRenditions", () => {
  it("takes, on Auto, the size the Target has on this Output", () => {
    let document = layer(stage(), "l_full", "full", { media: "neon/a" });
    document = layer(document, "l_wall", "wall", { media: "neon/b" });
    const renditions = videoRenditions(
      document,
      catalog,
      packs({
        a: video(2160, 100_000, [480, 1080]),
        b: video(2160, 100_000, [480]),
      }),
      frame,
    );
    expect(renditions.get("neon/a")).toEqual({ wanted: 1080, playing: 1080 });
    // 540 rows fit the 480 proxy stretched a little.
    expect(renditions.get("neon/b")).toEqual({ wanted: 480, playing: 480 });
    const fourK = videoRenditions(
      document,
      catalog,
      packs({ a: video(2160, 100_000, [480, 1080]), b: video(2160, 100_000) }),
      { outputId: "out", width: 3840, height: 2160 },
    );
    // The 4K original is over its budget, so its own size is a proxy too.
    expect(fourK.get("neon/a")).toEqual({ wanted: 2160, playing: 1080 });
    expect(fourK.get("neon/b")).toEqual({ wanted: 1080, playing: 480 });
  });

  it("plays one file per entry, the largest any Layer asks", () => {
    let document = layer(stage(), "l_wall", "wall", { media: "neon/a" });
    document = layer(document, "l_full", "full", { media: "neon/a" });
    const entries = packs({ a: video(2160, 20_000, [480, 720, 1080]) });
    expect(
      videoRenditions(document, catalog, entries, frame).get("neon/a"),
    ).toEqual({ wanted: 1080, playing: 1080 });
    document = layer(document, "l_max", "wall", {
      media: "neon/a",
      resolution: "original",
    });
    expect(
      videoRenditions(document, catalog, entries, frame).get("neon/a"),
    ).toEqual({ wanted: "original", playing: "original" });
  });

  it("takes a size picked by hand whatever the Target, and the smallest for a Layer not drawn here", () => {
    let document = layer(stage(), "l_wall", "wall", {
      media: "neon/a",
      resolution: "1440",
    });
    document = layer(document, "l_none", null, { media: "neon/b" });
    const renditions = videoRenditions(
      document,
      catalog,
      packs({ a: video(2160, 20_000), b: video(2160, 20_000) }),
      frame,
    );
    expect(renditions.get("neon/a")).toEqual({ wanted: 1440, playing: 480 });
    expect(renditions.get("neon/b")).toEqual({ wanted: 480, playing: 480 });
  });

  it("plays the original that already fits, and for a Parameter with no Resolution", () => {
    let document = layer(stage(), "l_full", "full", { media: "neon/a" });
    document = layer(document, "l_plain", "wall", { media: "neon/b" }, "plain");
    const renditions = videoRenditions(
      document,
      catalog,
      packs({ a: video(1080, 20_000), b: video(2160, 100_000) }),
      frame,
    );
    expect(renditions.get("neon/a")).toEqual({
      wanted: "original",
      playing: "original",
    });
    expect(renditions.get("neon/b")).toEqual({
      wanted: "original",
      playing: "original",
    });
  });

  it("keeps a page with a cap under it, Original included", () => {
    const document = layer(stage(), "l_full", "full", {
      media: "neon/a",
      resolution: "original",
    });
    expect(
      videoRenditions(
        document,
        catalog,
        packs({ a: video(2160, 100_000, [480, 1080]) }),
        { ...frame, maxVideoHeight: 480 },
      ).get("neon/a"),
    ).toEqual({ wanted: 480, playing: 480 });
  });

  it("asks as the Layer does for an entry a Macro would put on it", () => {
    let document = layer(stage(), "l_full", "full", { media: "neon/a" });
    document = run(document, "macro.create", { id: "m", name: "Swap" });
    document = run(document, "macro.actions.add", {
      macroId: "m",
      actions: [
        { kind: "set", address: "layer/l_full/param/media", value: "neon/b" },
      ],
    });
    expect(
      videoRenditions(
        document,
        catalog,
        packs({ a: video(2160, 20_000), b: video(2160, 20_000, [480, 1080]) }),
        frame,
      ).get("neon/b"),
    ).toEqual({ wanted: 1080, playing: 1080 });
  });
});
