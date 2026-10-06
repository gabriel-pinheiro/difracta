import type { PackEntryLive, PackLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import {
  folderCrumbs,
  folderOf,
  hoverSource,
  mediaRows,
  rankMediaRows,
  subfolders,
  tagCounts,
  WHOLE_LIBRARY,
} from "./media-search";

const entry = (
  id: string,
  file: string,
  over: Partial<PackEntryLive> = {},
): PackEntryLive => ({
  id,
  file,
  type: file.endsWith(".png") ? "image" : "video",
  name: id.replaceAll("-", " "),
  tags: [],
  fingerprint: "0123456789abcdef-1",
  status: "ok",
  hasThumbnail: true,
  proxies: [],
  ...over,
});

const pack = (name: string, entries: PackEntryLive[]): PackLive => ({
  name,
  readOnly: false,
  status: "ok",
  folder: `/p/${name}`,
  ffmpeg: true,
  prepared: { done: 0, total: 0 },
  entries: Object.fromEntries(entries.map((e) => [e.id, e])),
});

const packs = {
  bundled: pack("Bundled", [
    entry("beam", "clips/beam.webm", {
      tags: ["loop", "recommended"],
      description: "Spotlights sweep",
    }),
    entry("riser", "clips/riser.webm", {
      tags: ["Hit", "organic"],
      notes: "Builds to a crash",
    }),
  ]),
  neon: pack("Neon", [
    entry("tunnel", "tunnels/tunnel.mp4", { tags: ["loop", "organic"] }),
    entry("gone", "tunnels/dark/gone.mp4", { status: "missing" }),
    entry("logo", "logo.png", { tags: ["hit"] }),
  ]),
  lost: { ...pack("Lost", [entry("x", "x.mp4")]), status: "missing" as const },
};

describe("The Library's media rows", () => {
  const rows = mediaRows(packs);

  it("flattens every loaded Pack's entries with their folder, leaving missing Packs out", () => {
    expect(rows.map((row) => [row.reference, row.folder])).toEqual([
      ["bundled/beam", "clips"],
      ["bundled/riser", "clips"],
      ["neon/tunnel", "tunnels"],
      ["neon/gone", "tunnels/dark"],
      ["neon/logo", ""],
    ]);
    expect(folderOf("a.mp4")).toBe("");
  });

  it("ranks recommended first without a query, hides a missing entry unless the query names it", () => {
    const all = rankMediaRows(rows, "", WHOLE_LIBRARY).map((r) => r.reference);
    expect(all).toEqual([
      "bundled/beam",
      "neon/logo",
      "bundled/riser",
      "neon/tunnel",
    ]);
    expect(
      rankMediaRows(rows, "gone", WHOLE_LIBRARY).map((r) => r.reference),
    ).toEqual(["neon/gone"]);
  });

  it("scopes to a Pack, a folder and a type, and to rows carrying every picked tag", () => {
    const refs = (scope: Parameters<typeof rankMediaRows>[2]) =>
      rankMediaRows(rows, "", scope).map((r) => r.reference);
    expect(refs({ tags: [], packId: "neon" })).toEqual([
      "neon/logo",
      "neon/tunnel",
    ]);
    expect(refs({ tags: [], packId: "neon", folder: "tunnels" })).toEqual([
      "neon/tunnel",
    ]);
    expect(refs({ tags: [], type: "image" })).toEqual(["neon/logo"]);
    expect(refs({ tags: ["LOOP", "organic"] })).toEqual(["neon/tunnel"]);
  });

  it("searches names first, then tags, description and notes", () => {
    const refs = (query: string) =>
      rankMediaRows(rows, query, WHOLE_LIBRARY).map((r) => r.reference);
    expect(refs("hit")).toEqual(["neon/logo", "bundled/riser"]);
    expect(refs("spot")).toEqual(["bundled/beam"]);
    expect(refs("crash")).toEqual(["bundled/riser"]);
    expect(refs("tun")).toEqual(["neon/tunnel"]);
    expect(refs("zzz")).toEqual([]);
  });

  it("counts the tags of the matching rows, keeps picked ones, and drops the rest as the scope narrows", () => {
    const whole = rankMediaRows(rows, "", WHOLE_LIBRARY);
    expect(tagCounts(whole, [])).toEqual([
      { label: "hit", count: 2 },
      { label: "loop", count: 2 },
      { label: "organic", count: 2 },
      { label: "recommended", count: 1 },
    ]);
    const organic = rankMediaRows(rows, "", { tags: ["organic"] });
    expect(tagCounts(organic, ["organic"])).toEqual([
      { label: "organic", count: 2 },
      { label: "Hit", count: 1 },
      { label: "loop", count: 1 },
    ]);
    const both = rankMediaRows(rows, "", { tags: ["organic", "loop"] });
    expect(tagCounts(both, ["organic", "loop"]).map((t) => t.label)).toEqual([
      "loop",
      "organic",
    ]);
  });

  it("walks folders as crumbs and offers the next level down", () => {
    expect(folderCrumbs("tunnels/dark")).toEqual(["tunnels", "tunnels/dark"]);
    expect(folderCrumbs("")).toEqual([]);
    const neon = rows.filter((row) => row.packId === "neon");
    expect(subfolders(neon, undefined)).toEqual(["tunnels"]);
    expect(subfolders(neon, "tunnels")).toEqual(["tunnels/dark"]);
    expect(subfolders(neon, "tunnels/dark")).toEqual([]);
  });

  it("plays the proxy on hover, the original for a video without one, nothing for an image", () => {
    expect(hoverSource({ type: "video", proxies: [480, 1080] })).toBe("proxy");
    expect(hoverSource({ type: "video", proxies: [] })).toBe("original");
    // A larger size alone is not what the Library's proxy route serves.
    expect(hoverSource({ type: "video", proxies: [1080] })).toBe("original");
    expect(hoverSource({ type: "image", proxies: [] })).toBeUndefined();
  });
});
