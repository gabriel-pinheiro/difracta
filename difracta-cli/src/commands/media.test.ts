import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { resolveId, resolvePayloadNames } from "../names.ts";
import { formatMedia, listMedia, mediaGroupId } from "./media.ts";

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
      "    loop  m_loop   file   video  …        loop.mp4",
    ]);
    expect(formatMedia([])).toContain("media add");
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
