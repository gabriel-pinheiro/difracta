import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { VideoFiles } from "./video-files.ts";
import { catalog, layer, packs, stage, video } from "./video-fixture.ts";

const SETTLE = settings.packs.proxy.settleMs;
const frame = (now: number, width = 1920, height = 1080) => ({
  width,
  height,
  now,
});

function files(maxVideoHeight?: number) {
  const asked: string[] = [];
  const videos = new VideoFiles({
    catalog,
    maxVideoHeight,
    prepare: (reference, height) =>
      asked.push(`${reference}@${String(height)}`),
  });
  return { videos, asked };
}

describe("VideoFiles", () => {
  it("plays what is baked at once and asks for the size it wants", () => {
    const { videos, asked } = files();
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    const state = packs({ a: video(2160, 100_000) });
    expect(videos.sync(document, state, "out", frame(0))).toBe(true);
    expect(videos.playing("neon/a")).toBe(480);
    expect(asked).toEqual(["neon/a@1080"]);
    // The same frame again changes nothing and asks nothing.
    expect(videos.sync(document, state, "out", frame(16))).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("changes the file of a video already playing only once the answer has settled", () => {
    const { videos } = files();
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    videos.sync(document, packs({ a: video(2160, 100_000) }), "out", frame(0));
    const baked = packs({ a: video(2160, 100_000, [480, 1080]) });
    expect(videos.sync(document, baked, "out", frame(100))).toBe(false);
    expect(videos.playing("neon/a")).toBe(480);
    expect(videos.sync(document, baked, "out", frame(SETTLE))).toBe(false);
    expect(videos.sync(document, baked, "out", frame(100 + SETTLE))).toBe(true);
    expect(videos.playing("neon/a")).toBe(1080);
  });

  it("keeps the file when the size goes back before it settled", () => {
    const { videos } = files();
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    const state = packs({ a: video(2160, 20_000, [480, 720, 1080]) });
    videos.sync(document, state, "out", frame(0));
    expect(videos.playing("neon/a")).toBe(1080);
    // The window shrinks for a moment, then is back.
    expect(videos.sync(document, state, "out", frame(100, 960, 540))).toBe(
      false,
    );
    expect(videos.sync(document, state, "out", frame(200))).toBe(false);
    expect(videos.sync(document, state, "out", frame(200 + SETTLE))).toBe(
      false,
    );
    expect(videos.playing("neon/a")).toBe(1080);
  });

  it("takes a new file at once when the entry's file changed", () => {
    const { videos } = files();
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    videos.sync(
      document,
      packs({ a: video(2160, 20_000, [480, 1080]) }),
      "out",
      frame(0),
    );
    expect(videos.playing("neon/a")).toBe(1080);
    // Another file under the same reference: its proxies are not baked yet.
    expect(
      videos.sync(
        document,
        packs({ a: video(2160, 30_000) }),
        "out",
        frame(16),
      ),
    ).toBe(true);
    expect(videos.playing("neon/a")).toBe(480);
  });

  it("asks again when the Pack's state changes while the size is still missing, and never a read-only Pack", () => {
    const { videos, asked } = files();
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    const state = packs({ a: video(2160, 100_000) });
    videos.sync(document, state, "out", frame(0));
    videos.sync(document, { ...state }, "out", frame(16));
    expect(asked).toHaveLength(1);
    videos.sync(document, packs({ a: video(2160, 100_000) }), "out", frame(32));
    expect(asked).toEqual(["neon/a@1080", "neon/a@1080"]);
    const readOnly = files();
    const bundled = packs({ a: video(2160, 100_000) });
    readOnly.videos.sync(
      document,
      {
        neon: {
          ...bundled.neon,
          status: "ok",
          entries: bundled.neon?.entries ?? {},
          readOnly: true,
        },
      },
      "out",
      frame(0),
    );
    expect(readOnly.asked).toEqual([]);
    // No bake is coming, so it does not wait below what it wants.
    expect(readOnly.videos.playing("neon/a")).toBe("original");
  });

  it("asks for nothing under a cap the base proxy serves", () => {
    const { videos, asked } = files(480);
    const document = layer(stage(), "l_full", "full", { media: "neon/a" });
    videos.sync(document, packs({ a: video(2160, 100_000) }), "out", frame(0));
    expect(videos.playing("neon/a")).toBe(480);
    expect(asked).toEqual([]);
  });

  it("forgets a video the document stopped naming", () => {
    const { videos } = files();
    const state = packs({ a: video(2160, 20_000) });
    videos.sync(
      layer(stage(), "l_full", "full", { media: "neon/a" }),
      state,
      "out",
      frame(0),
    );
    videos.sync(stage(), state, "out", frame(16));
    expect(videos.playing("neon/a")).toBeUndefined();
  });
});
