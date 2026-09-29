import { describe, expect, it } from "vitest";

import { mediaDefinitionsFromManifest } from "../catalog/bundle-manifest.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  DocumentSchema,
  emptyDocument,
  type Document,
} from "../document/document.ts";
import { mediaBeatsIn, tempoOf } from "../document/media.ts";
import { createBuiltInRegistry } from "./index.ts";

const entry = {
  id: "ring",
  name: "Ring",
  description: "A ring.",
  notes: "Pulses.",
  file: "clips/ring.webm",
  type: "video",
  loop: true,
  thumbnailAt: 1,
  width: 16,
  height: 9,
  duration: 7.5,
};
const catalog = new Catalog({
  media: mediaDefinitionsFromManifest({
    version: 1,
    items: [
      { ...entry, beats: 16 },
      { ...entry, id: "late", name: "Late", beats: 8, firstBeat: 0.25 },
      { ...entry, id: "free", name: "Free" },
    ],
  }),
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["media.create", { id: "m_loop", path: "loop.webm" }],
    ["media.create", { id: "m_logo", path: "logo.png" }],
    ["media.create", { id: "m_ring", kind: "bundled", bundled: "ring" }],
    ["media.create", { id: "m_late", kind: "bundled", bundled: "late" }],
    ["media.create", { id: "m_free", kind: "bundled", bundled: "free" }],
    ["media.create", { id: "m_group", kind: "group", name: "Loops" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const beatsOf = (document: Document, id: string) => {
  const item = document.media[id];
  if (item === undefined) throw new Error(`No Media ${id}.`);
  return mediaBeatsIn(item, catalog);
};

describe("Media beats", () => {
  it("derives a clip's tempo from its beats and its length", () => {
    expect(tempoOf(16, 7.5)).toBe(128);
    expect(tempoOf(16, 7.1)).toBeCloseTo(135.21, 2);
  });

  it("reads a bundled item's from its entry, the first beat zero unless said", () => {
    const document = installation();
    expect(beatsOf(document, "m_ring")).toEqual({ beats: 16, firstBeat: 0 });
    expect(beatsOf(document, "m_late")).toEqual({ beats: 8, firstBeat: 0.25 });
    expect(beatsOf(document, "m_free")).toBeUndefined();
    expect(beatsOf(document, "m_group")).toBeUndefined();
    expect(beatsOf(document, "m_loop")).toBeUndefined();
  });

  it("sets, changes and removes a video file's, storing no zero first beat", () => {
    let document = installation();
    const set = run(document, "media.beats", { mediaId: "m_loop", beats: 16 });
    expect(set.label).toBe("Change Media Beats");
    expect(set.patches).toEqual([
      { op: "set", path: ["media", "m_loop", "beats"], value: 16 },
    ]);
    document = set.document;
    expect(beatsOf(document, "m_loop")).toEqual({ beats: 16, firstBeat: 0 });
    expect(
      run(document, "media.beats", { mediaId: "m_loop", beats: 16 }).patches,
    ).toEqual([]);

    document = run(document, "media.beats", {
      mediaId: "m_loop",
      beats: 8,
      firstBeat: 0.2,
    }).document;
    expect(beatsOf(document, "m_loop")).toEqual({ beats: 8, firstBeat: 0.2 });
    // Beats alone keep the first beat the item has.
    document = run(document, "media.beats", {
      mediaId: "m_loop",
      beats: 4,
    }).document;
    expect(beatsOf(document, "m_loop")).toEqual({ beats: 4, firstBeat: 0.2 });
    document = run(document, "media.beats", {
      mediaId: "m_loop",
      beats: 4,
      firstBeat: 0,
    }).document;
    expect(document.media.m_loop).not.toHaveProperty("firstBeat");

    document = run(document, "media.beats", {
      mediaId: "m_loop",
      beats: 4,
      firstBeat: 0.1,
    }).document;
    const removed = run(document, "media.beats", {
      mediaId: "m_loop",
      beats: null,
    });
    expect(removed.label).toBe("Remove Media Beats");
    expect(removed.document.media.m_loop).not.toHaveProperty("beats");
    expect(removed.document.media.m_loop).not.toHaveProperty("firstBeat");
    expect(DocumentSchema.safeParse(removed.document).success).toBe(true);
    expect(DocumentSchema.safeParse(document).success).toBe(true);
  });

  it("refuses anything but a video file, and values that make no sense", () => {
    const document = installation();
    expect(
      refuse(document, "media.beats", { mediaId: "m_logo", beats: 16 }),
    ).toContain("not a video");
    expect(
      refuse(document, "media.beats", { mediaId: "m_ring", beats: 16 }),
    ).toContain("bundled");
    expect(
      refuse(document, "media.beats", { mediaId: "m_group", beats: 16 }),
    ).toContain("Media Group");
    expect(
      refuse(document, "media.beats", { mediaId: "nope", beats: 16 }),
    ).toContain("does not exist");
    expect(
      refuse(document, "media.beats", {
        mediaId: "m_loop",
        beats: null,
        firstBeat: 1,
      }),
    ).toContain("needs beats");
    for (const beats of [0, -4, 1e9])
      expect(
        refuse(document, "media.beats", { mediaId: "m_loop", beats }),
      ).not.toBe("");
  });

  it("keeps them when the file is repointed at a video and drops them at an image", () => {
    let document = run(installation(), "media.beats", {
      mediaId: "m_loop",
      beats: 16,
      firstBeat: 0.5,
    }).document;
    document = run(document, "media.path", {
      mediaId: "m_loop",
      path: "loop-v2.mp4",
    }).document;
    expect(beatsOf(document, "m_loop")).toEqual({ beats: 16, firstBeat: 0.5 });
    document = run(document, "media.path", {
      mediaId: "m_loop",
      path: "still.png",
    }).document;
    expect(document.media.m_loop).not.toHaveProperty("beats");
    expect(document.media.m_loop).not.toHaveProperty("firstBeat");
  });
});
