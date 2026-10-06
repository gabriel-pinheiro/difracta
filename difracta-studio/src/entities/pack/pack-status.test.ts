import type { PackEntryLive, PackLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import {
  entriesText,
  FFMPEG_MISSING,
  packRowStatus,
  packWarning,
  preparedText,
  toGo,
} from "./pack-status";

const entry = (id: string, status: "ok" | "missing"): PackEntryLive => ({
  id,
  file: `${id}.mp4`,
  type: "video",
  name: id,
  tags: [],
  fingerprint: "0123456789abcdef-1",
  status,
  hasThumbnail: status === "ok",
  proxies: [],
});

const pack = (over: Partial<PackLive>): PackLive => ({
  name: "Neon",
  readOnly: false,
  status: "ok",
  folder: "/packs/neon",
  ffmpeg: true,
  prepared: { done: 2, total: 2 },
  entries: { a: entry("a", "ok"), b: entry("b", "missing") },
  ...over,
});

describe("A Pack's row status", () => {
  it("is loading until the runtime has scanned it, missing when nothing is the Pack", () => {
    expect(packRowStatus(undefined)).toEqual({ kind: "loading" });
    expect(packRowStatus(pack({ status: "loading" }))).toEqual({
      kind: "loading",
    });
    expect(packRowStatus(pack({ status: "missing" }))).toEqual({
      kind: "missing",
    });
  });

  it("is preparing while thumbnails and proxies bake, then ready", () => {
    expect(packRowStatus(pack({ prepared: { done: 42, total: 310 } }))).toEqual(
      { kind: "preparing", done: 42, total: 310 },
    );
    expect(packRowStatus(pack({}))).toEqual({ kind: "ready" });
  });

  it("warns about a limit the scan hit or a runtime without ffmpeg, and about nothing else", () => {
    expect(packWarning(pack({}))).toBeUndefined();
    expect(packWarning(pack({ warning: "Only the first 1000 files." }))).toBe(
      "Only the first 1000 files.",
    );
    expect(packWarning(pack({ ffmpeg: false }))).toBe(FFMPEG_MISSING);
    expect(packWarning(pack({ status: "missing", ffmpeg: false }))).toBe(
      undefined,
    );
  });

  it("counts entries and prepared files as a person reads them", () => {
    expect(preparedText({ done: 42, total: 310 })).toBe("Preparing, 268 to go");
    expect(toGo({ done: 64, total: 68 })).toBe(4);
    expect(toGo({ done: 3, total: 3 })).toBe(0);
    expect(preparedText({ done: 3, total: 3 })).toBe("Prepared");
    expect(entriesText(pack({}).entries)).toBe("2 entries, 1 missing");
    expect(entriesText({ a: entry("a", "ok") })).toBe("1 entry");
    expect(entriesText({})).toBe("No entries");
  });
});
