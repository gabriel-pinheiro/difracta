import type { PackLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { diffPackLive, preparedCount } from "./pack-live.ts";

const entry = (
  over: Partial<PackLive["entries"][string]> = {},
): PackLive["entries"][string] => ({
  id: "a",
  file: "a.mp4",
  type: "video",
  name: "A",
  tags: [],
  fingerprint: "0000000000000000-1",
  status: "ok",
  hasThumbnail: false,
  hasProxy: false,
  ...over,
});
const pack = (over: Partial<PackLive> = {}): PackLive => ({
  name: "Neon",
  readOnly: false,
  status: "ok",
  folder: "/neon",
  ffmpeg: true,
  prepared: { done: 0, total: 1 },
  entries: { a: entry() },
  ...over,
});

describe("diffPackLive", () => {
  it("sets a new Pack whole and then patches properties one by one", () => {
    expect(diffPackLive("p", undefined, pack())).toEqual([
      { op: "set", path: ["packs", "p"], value: pack() },
    ]);
    const next = pack({
      name: "Neon VJ",
      warning: "limit",
      prepared: { done: 1, total: 1 },
      entries: {
        a: entry({
          tags: ["loop"],
          hasThumbnail: true,
          hasProxy: true,
          width: 64,
        }),
        b: entry({ id: "b", file: "b.png", type: "image", status: "missing" }),
      },
    });
    expect(diffPackLive("p", pack(), next)).toEqual([
      { op: "set", path: ["packs", "p", "name"], value: "Neon VJ" },
      { op: "set", path: ["packs", "p", "warning"], value: "limit" },
      {
        op: "set",
        path: ["packs", "p", "prepared"],
        value: { done: 1, total: 1 },
      },
      {
        op: "set",
        path: ["packs", "p", "entries", "a", "tags"],
        value: ["loop"],
      },
      {
        op: "set",
        path: ["packs", "p", "entries", "a", "hasThumbnail"],
        value: true,
      },
      {
        op: "set",
        path: ["packs", "p", "entries", "a", "hasProxy"],
        value: true,
      },
      { op: "set", path: ["packs", "p", "entries", "a", "width"], value: 64 },
      {
        op: "set",
        path: ["packs", "p", "entries", "b"],
        value: next.entries.b,
      },
    ]);
    expect(diffPackLive("p", next, pack())).toEqual([
      { op: "set", path: ["packs", "p", "name"], value: "Neon" },
      { op: "remove", path: ["packs", "p", "warning"] },
      {
        op: "set",
        path: ["packs", "p", "prepared"],
        value: { done: 0, total: 1 },
      },
      { op: "remove", path: ["packs", "p", "entries", "b"] },
      { op: "set", path: ["packs", "p", "entries", "a", "tags"], value: [] },
      {
        op: "set",
        path: ["packs", "p", "entries", "a", "hasThumbnail"],
        value: false,
      },
      {
        op: "set",
        path: ["packs", "p", "entries", "a", "hasProxy"],
        value: false,
      },
      { op: "remove", path: ["packs", "p", "entries", "a", "width"] },
    ]);
    expect(diffPackLive("p", pack(), pack())).toEqual([]);
  });

  it("counts prepared entries among those whose file is there", () => {
    expect(
      preparedCount({
        a: entry({ hasThumbnail: true, hasProxy: true }),
        b: entry({ id: "b", type: "image", hasThumbnail: true }),
        c: entry({ id: "c", hasThumbnail: true }),
        d: entry({ id: "d", status: "missing" }),
      }),
    ).toEqual({ done: 2, total: 3 });
  });
});
