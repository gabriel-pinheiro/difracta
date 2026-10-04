import { describe, expect, it } from "vitest";

import { settings } from "../settings.ts";
import {
  hasTag,
  PACK_FILE_PATTERN,
  PackManifestSchema,
  parsePackManifest,
} from "./manifest.ts";

const entry = {
  id: "hit-flash-cut",
  file: "clips/hit-flash-cut.webm",
  type: "video",
  name: "Flash Cut",
  description: "A white flash.",
  notes: "On the downbeat.",
  tags: ["hit", "Recommended"],
  fingerprint: "3fa9c2e8b1d4a6f0-1k9z",
  width: 1920,
  height: 1080,
  duration: 1.2,
  thumbnailAt: 0.1,
};
const manifest = {
  version: 1,
  id: "bundled",
  name: "Bundled",
  entries: [entry],
};

describe("the Pack manifest", () => {
  it("parses a manifest, read-only or not, with measured and unmeasured entries", () => {
    const parsed = parsePackManifest(manifest);
    expect(parsed.ok && parsed.manifest.entries[0]?.name).toBe("Flash Cut");
    expect(parsePackManifest({ ...manifest, readOnly: true }).ok).toBe(true);
    const bare = {
      id: "tunnels-04",
      file: "tunnels/04.mp4",
      type: "video",
      name: "04",
      tags: [],
      fingerprint: "0000000000000000-0",
    };
    expect(parsePackManifest({ ...manifest, entries: [bare] }).ok).toBe(true);
  });

  it("is strict about shape, ids, files and fingerprints", () => {
    const refuse = (change: Record<string, unknown>): string => {
      const parsed = parsePackManifest({
        ...manifest,
        entries: [{ ...entry, ...change }],
      });
      return parsed.ok ? "" : parsed.error;
    };
    expect(refuse({ extra: 1 })).toContain("not valid");
    expect(refuse({ id: "Flash" })).toContain("not valid");
    expect(refuse({ file: ".hidden/x.mp4" })).toContain("not valid");
    expect(refuse({ file: "clips/../x.mp4" })).toContain("not valid");
    expect(refuse({ file: "/abs/x.mp4" })).toContain("not valid");
    expect(refuse({ fingerprint: "nope" })).toContain("not valid");
    expect(refuse({ type: "live" })).toContain("not valid");
    expect(refuse({ beats: settings.media.maxBeats + 1 })).toContain(
      "not valid",
    );
    expect(refuse({ width: 0 })).toContain("not valid");
    expect(parsePackManifest({ ...manifest, version: 2 }).ok).toBe(false);
    expect(parsePackManifest({ ...manifest, readOnly: false }).ok).toBe(false);
    expect(parsePackManifest({ ...manifest, id: "Bundled" }).ok).toBe(false);
    expect(
      PackManifestSchema.safeParse({ ...manifest, entries: [entry, entry] })
        .success,
    ).toBe(false);
  });

  it("takes files in folders with any characters but a leading dot or a slash", () => {
    expect(PACK_FILE_PATTERN.test("Tunnels & Lights/Clip 04 (final).MP4")).toBe(
      true,
    );
    expect(PACK_FILE_PATTERN.test("Robots/(Draft)SilverDawn.mov")).toBe(true);
    expect(PACK_FILE_PATTERN.test("#1 opener/[v2] ~final~.webm")).toBe(true);
    expect(PACK_FILE_PATTERN.test("..")).toBe(false);
    expect(PACK_FILE_PATTERN.test("a/./c.mp4")).toBe(false);
    expect(PACK_FILE_PATTERN.test("a/.b/c.mp4")).toBe(false);
    expect(PACK_FILE_PATTERN.test("a//c.mp4")).toBe(false);
    expect(PACK_FILE_PATTERN.test("")).toBe(false);
  });

  it("reads a tag ignoring case", () => {
    expect(hasTag(entry, "recommended")).toBe(true);
    expect(hasTag(entry, "HIT")).toBe(true);
    expect(hasTag(entry, "loop")).toBe(false);
  });
});
