import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { resolveId } from "../names.ts";
import { elapsed, formatShares, listShares } from "./share.ts";

const registry = createBuiltInRegistry();

/** Slides, then a Screen Share with the default name. */
function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["share.create", { id: "m_slides", name: "Slides" }],
    ["share.create", { id: "m_cam" }],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

const live = {
  m_slides: {
    status: "live",
    sharer: "Laptop",
    source: "window",
    since: 1_000,
    viewers: 1,
  },
  m_cam: { status: "idle" },
} as const;

describe("share list", () => {
  it("lists every Screen Share with its status, Sharer, source, age and Viewers", () => {
    const items = listShares(stage(), live);
    expect(items).toEqual([
      {
        id: "m_slides",
        name: "Slides",
        status: "live",
        sharer: "Laptop",
        source: "window",
        since: 1_000,
        viewers: 1,
      },
      {
        id: "m_cam",
        name: "Screen Share",
        status: "idle",
        sharer: null,
        source: null,
        since: null,
        viewers: null,
      },
    ]);
    expect(formatShares(items, 1_000 + 125_000).split("\n")).toEqual([
      "Slides        m_slides  live  by Laptop  window  for 2 min  1 Viewer",
      "Screen Share  m_cam     idle",
    ]);
    expect(formatShares([])).toContain("media screen-share");
  });

  it("says how long a share has run", () => {
    expect(elapsed(0, 45_000)).toBe("45 s");
    expect(elapsed(0, 3 * 60_000)).toBe("3 min");
    expect(elapsed(0, 125 * 60_000)).toBe("2 h 5 min");
    expect(elapsed(10, 0)).toBe("0 s");
  });

  it("finds a Screen Share by name for share stop", () => {
    expect(resolveId(stage(), "shares", "slides")).toBe("m_slides");
  });
});
