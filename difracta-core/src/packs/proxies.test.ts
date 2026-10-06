import { describe, expect, it } from "vitest";

import { formatFingerprint } from "./ids.ts";
import {
  autoProxyHeight,
  entryBitrateKbps,
  parseResolution,
  playableRendition,
  RESOLUTION_OPTIONS,
  wantedRendition,
} from "./proxies.ts";

/** An entry of `height` rows lasting 8 s at `kbps`. */
const entry = (height: number | undefined, kbps: number) => ({
  fingerprint: formatFingerprint("ab".repeat(32), kbps * 1000),
  height,
  duration: 8,
});

describe("Resolution options", () => {
  it("lists Auto, Original and the proxy sizes, largest first", () => {
    expect(RESOLUTION_OPTIONS.map((option) => option.label)).toEqual([
      "Auto",
      "Original",
      "4K",
      "1440p",
      "1080p",
      "720p",
      "480p",
    ]);
  });

  it("reads a value, taking anything unknown as Auto", () => {
    expect(parseResolution("original")).toBe("original");
    expect(parseResolution("1080")).toBe(1080);
    expect(parseResolution("auto")).toBe("auto");
    expect(parseResolution("900")).toBe("auto");
    expect(parseResolution(1080)).toBe("auto");
    expect(parseResolution(undefined)).toBe("auto");
  });
});

describe("autoProxyHeight", () => {
  it("takes the smallest size that covers the rows, stretched a little", () => {
    expect(autoProxyHeight(300)).toBe(480);
    expect(autoProxyHeight(600)).toBe(480);
    expect(autoProxyHeight(601)).toBe(720);
    expect(autoProxyHeight(1080)).toBe(1080);
    expect(autoProxyHeight(1200)).toBe(1080);
    expect(autoProxyHeight(2160)).toBe(2160);
    expect(autoProxyHeight(5000)).toBe(2160);
  });
});

describe("entryBitrateKbps", () => {
  it("is the file's size over its length", () => {
    expect(entryBitrateKbps(entry(1080, 20_000))).toBeCloseTo(20_000);
    expect(
      entryBitrateKbps({ ...entry(1080, 20_000), duration: undefined }),
    ).toBeUndefined();
  });
});

describe("wantedRendition", () => {
  it("plays the original when asked to, or while the entry is not measured", () => {
    expect(wantedRendition(entry(2160, 300_000), "original")).toBe("original");
    expect(wantedRendition(entry(undefined, 300_000), 1080)).toBe("original");
  });

  it("plays an original that fits the size and its budget as it is", () => {
    expect(wantedRendition(entry(1080, 20_000), 1080)).toBe("original");
    expect(wantedRendition(entry(1080, 20_000), 2160)).toBe("original");
    expect(wantedRendition(entry(360, 800), 480)).toBe("original");
  });

  it("plays a proxy of the size when the original is taller", () => {
    expect(wantedRendition(entry(2160, 20_000), 1080)).toBe(1080);
    expect(wantedRendition(entry(1080, 20_000), 480)).toBe(480);
  });

  it("plays a proxy of the original's own size when its bitrate is over budget", () => {
    expect(wantedRendition(entry(2160, 120_000), 2160)).toBe(2160);
    expect(wantedRendition(entry(1080, 80_000), 1080)).toBe(1080);
  });

  it("never asks for a size larger than the one holding the original", () => {
    expect(wantedRendition(entry(1080, 80_000), 2160)).toBe(1080);
    expect(wantedRendition(entry(900, 80_000), 2160)).toBe(1080);
    expect(wantedRendition(entry(4320, 20_000), 2160)).toBe(2160);
  });
});

describe("playableRendition", () => {
  it("plays what is wanted when it is there", () => {
    expect(playableRendition("original", [])).toBe("original");
    expect(playableRendition(1080, [480, 1080])).toBe(1080);
  });

  it("falls back to the largest proxy below, then the smallest above, then the original", () => {
    expect(playableRendition(1080, [480, 720, 2160])).toBe(720);
    expect(playableRendition(720, [1080, 2160])).toBe(1080);
    expect(playableRendition(720, [])).toBe("original");
  });

  it("never goes below what was asked when no bake is coming", () => {
    expect(playableRendition(720, [480], false)).toBe("original");
    expect(playableRendition(720, [480, 1080], false)).toBe(1080);
    expect(playableRendition(480, [480], false)).toBe(480);
  });
});
