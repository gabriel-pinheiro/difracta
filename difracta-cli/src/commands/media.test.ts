import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { resolveId, resolvePayloadNames } from "../names.ts";
import { beatsPayload, formatMedia, listMedia, mediaGroupId } from "./media.ts";

const registry = createBuiltInRegistry();

/** Logo at the root, and Art { Logo, Clips { Loop } }. */
function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["media.create", { id: "m_logo", path: "logo.png" }],
    ["media.create", { id: "g_art", kind: "group", name: "Art" }],
    ["media.create", { id: "m_art", path: "art/logo.png", parentId: "g_art" }],
    [
      "media.create",
      { id: "g_clips", kind: "group", name: "Clips", parentId: "g_art" },
    ],
    ["media.create", { id: "m_loop", path: "loop.mp4", parentId: "g_clips" }],
    ["media.beats", { mediaId: "m_loop", beats: 16 }],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

describe("media list", () => {
  it("lists the tree in navigator order with kind, type, status and path", () => {
    const items = listMedia(stage(), {
      m_logo: { status: "ok" },
      m_art: { status: "missing" },
    });
    expect(items.map((item) => [item.id, item.depth, item.kind])).toEqual([
      ["m_logo", 0, "file"],
      ["g_art", 0, "group"],
      ["m_art", 1, "file"],
      ["g_clips", 1, "group"],
      ["m_loop", 2, "file"],
    ]);
    expect(items[1]).toMatchObject({ path: null, type: null });
    expect(formatMedia(items).split("\n")).toEqual([
      "logo      m_logo   file   image  ok       logo.png",
      "Art       g_art    group",
      "  logo    m_art    file   image  missing  art/logo.png",
      "  Clips   g_clips  group",
      "    loop  m_loop   file   video  …        loop.mp4      16 beats",
    ]);
    expect(items[4]).toMatchObject({ beats: 16, firstBeat: 0 });
    expect(items[0]).toMatchObject({ beats: null, firstBeat: null });
    expect(formatMedia([])).toContain("media add");
  });
});

describe("media beats", () => {
  it("reads a number of beats or none, and a first beat", () => {
    expect(beatsPayload("m_loop", "16", undefined)).toEqual({
      mediaId: "m_loop",
      beats: 16,
    });
    expect(beatsPayload("m_loop", " None ", undefined)).toEqual({
      mediaId: "m_loop",
      beats: null,
    });
    expect(beatsPayload("m_loop", "7.5", "0.25")).toEqual({
      mediaId: "m_loop",
      beats: 7.5,
      firstBeat: 0.25,
    });
    expect(() => beatsPayload("m_loop", "sixteen", undefined)).toThrow(
      "Beats must be a number, not “sixteen”.",
    );
    expect(() => beatsPayload("m_loop", "16", "soon")).toThrow(
      "The first beat must be a number",
    );
  });
});

describe("Media names", () => {
  it("resolves a name across the tree and refuses an ambiguous one with the ids", () => {
    const document = stage();
    expect(resolveId(document, "media", "loop")).toBe("m_loop");
    expect(() => resolveId(document, "media", "logo")).toThrow(
      "“logo” matches 2 Media items: logo (m_logo), logo (m_art, in Group Art)",
    );
    expect(mediaGroupId(document, "clips")).toBe("g_clips");
    expect(() => mediaGroupId(document, "loop")).toThrow(
      "“loop” is not a Media Group.",
    );
    expect(
      resolvePayloadNames(document, "media.move", {
        mediaId: "loop",
        parentId: "Art",
        after: "Clips",
      }),
    ).toEqual({ mediaId: "m_loop", parentId: "g_art", after: "g_clips" });
  });
});
