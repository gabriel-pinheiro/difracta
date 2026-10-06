import { describe, expect, it } from "vitest";

import { packs, stage } from "../media-fixtures.ts";
import {
  formatEntries,
  formatPackEntries,
  listEntries,
  listingPacks,
} from "./media-listing.ts";
import { describePrepared, parseProxyHeight } from "./media-prepare.ts";
import { mergeTags, parseBeats } from "./media.ts";

describe("media list", () => {
  it("lists a Pack's entries in path order with reference, path, type, size, length, beats, proxies, tags and missing", () => {
    const bundled = listEntries("bundled", packs.bundled!);
    expect(bundled).toHaveLength(1);
    expect(bundled[0]).toMatchObject({
      reference: "bundled/beam-scan-loop",
      file: "clips/beam-scan-loop.webm",
      type: "video",
      width: 1920,
      duration: 7.1,
      beats: 16,
      firstBeat: 0,
      tags: ["loop"],
      status: "ok",
      proxies: [480],
    });
    expect(formatEntries(bundled)).toBe(
      "bundled/beam-scan-loop  clips/beam-scan-loop.webm  video  1920×1080  7.1 s  16 beats, 135.2 BPM  proxies 480p  loop",
    );
    const neon = listEntries("neon-k7f3", packs["neon-k7f3"]!);
    expect(neon.map((item) => item.file)).toEqual([
      "Tunnels/04.MP4",
      "logo.png",
      "tunnels/04.mp4",
    ]);
    expect(formatEntries(neon).split("\n")[1]).toBe(
      "neon-k7f3/logo          logo.png        image                        missing",
    );
  });

  it("groups every Pack under a heading, saying which are not loaded or missing", () => {
    const groups = listingPacks(stage(), packs);
    expect(groups.map((group) => group.packId)).toEqual([
      "bundled",
      "neon-k7f3",
      "neon-x1y2",
      "tour-a9b8",
    ]);
    const text = formatPackEntries(groups);
    expect(text).toContain("Bundled  bundled\n  bundled/beam-scan-loop");
    expect(text).toContain("Neon  neon-x1y2  not loaded\n  No entries here");
    expect(text).toContain("Tour  tour-a9b8  missing\n  No entries here");
  });
});

describe("media prepare", () => {
  const pack = { readOnly: false, ffmpeg: true };
  /** A video of `height` rows lasting 8 s at `kbps`, with the smallest proxy baked. */
  const video = (height: number, kbps: number, proxies = [480]) => ({
    type: "video" as const,
    proxies,
    fingerprint: `0123456789abcdef-${(kbps * 1000).toString(36)}`,
    height,
    duration: 8,
  });

  it("reads a size as rows, with p or as 4k, and refuses anything else", () => {
    expect(parseProxyHeight("1080")).toBe(1080);
    expect(parseProxyHeight("720p")).toBe(720);
    expect(parseProxyHeight("4K")).toBe(2160);
    expect(() => parseProxyHeight("900")).toThrow(
      "A proxy is baked at 480, 720, 1080, 1440, 2160 rows (4k is 2160); not “900”.",
    );
  });

  it("says what is being baked, or why nothing is", () => {
    const say = (
      height: number,
      baking: number | null,
      entry: Parameters<typeof describePrepared>[4],
      from = pack,
    ) => describePrepared("neon-k7f3/tunnel", height, baking, from, entry);
    expect(say(1080, 1080, video(2160, 120_000))).toBe(
      "neon-k7f3/tunnel: baking its 1080p proxy; `difracta packs list` says preparing until it is there.",
    );
    expect(say(2160, 1080, video(1080, 80_000))).toBe(
      "neon-k7f3/tunnel: baking its 1080p proxy, the largest its original needs; `difracta packs list` says preparing until it is there.",
    );
    expect(say(1080, null, video(1080, 20_000))).toBe(
      "neon-k7f3/tunnel: nothing to bake, its original plays at 1080p as it is.",
    );
    expect(say(1080, null, video(2160, 120_000, [480, 1080]))).toBe(
      "neon-k7f3/tunnel: nothing to bake, its 1080p proxy is there.",
    );
    expect(
      say(1080, null, video(2160, 120_000), { readOnly: true, ffmpeg: true }),
    ).toBe(
      "neon-k7f3/tunnel: nothing is baked for a read-only Pack; it plays from what it ships.",
    );
    expect(
      say(1080, null, video(2160, 120_000), { readOnly: false, ffmpeg: false }),
    ).toBe(
      "neon-k7f3/tunnel: nothing is baked, the runtime's machine has no ffmpeg.",
    );
    expect(say(1080, null, { ...video(1080, 20_000), type: "image" })).toBe(
      "neon-k7f3/tunnel is an image; only a video has proxies.",
    );
  });
});

describe("media tag", () => {
  it("adds tags once each ignoring case and keeps the first spelling", () => {
    expect(mergeTags(["Loop"], ["loop", "riser", " riser "], false)).toEqual([
      "Loop",
      "riser",
    ]);
  });

  it("takes tags away ignoring case", () => {
    expect(mergeTags(["Loop", "riser"], ["LOOP"], true)).toEqual(["riser"]);
  });
});

describe("media beats", () => {
  it("reads a count or none and refuses the rest", () => {
    expect(parseBeats("16")).toBe(16);
    expect(parseBeats("None")).toBeNull();
    expect(() => parseBeats("fast")).toThrow("positive number of beats");
    expect(() => parseBeats("0")).toThrow("positive number of beats");
  });
});
