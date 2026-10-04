import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { fakePacks } from "./pack-fakes.ts";
import { entryOf, packSources, type PacksView } from "./pack-sources.ts";

const picture: VisualDefinition = {
  kind: "visual",
  id: "picture",
  name: "Picture",
  description: "Shows an image.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "image", label: "Image", default: "" },
  },
};
const clip: VisualDefinition = {
  kind: "visual",
  id: "clip",
  name: "Clip",
  description: "Plays a video.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "video", label: "Video", default: "" },
  },
};
const catalog = new Catalog({ visuals: [picture, clip] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** A Picture Layer and a Clip Layer, and a Macro setting the Picture to another entry. */
function installation(pictureRef: string, clipRef: string): Document {
  let document = emptyDocument("Living");
  document = run(document, "scene.create", { id: "scene", name: "Main" });
  document = run(document, "layer.create", {
    id: "l_pic",
    sceneId: "scene",
    kind: "visual",
  });
  document = run(document, "layer.visual", {
    layerId: "l_pic",
    visual: "picture",
    parameters: { media: pictureRef },
  });
  document = run(document, "layer.create", {
    id: "l_clip",
    sceneId: "scene",
    kind: "visual",
  });
  document = run(document, "layer.visual", {
    layerId: "l_clip",
    visual: "clip",
    parameters: { media: clipRef },
  });
  document = run(document, "macro.create", { id: "m", name: "Swap" });
  return run(document, "macro.actions.add", {
    macroId: "m",
    actions: [
      {
        kind: "set",
        address: "layer/l_pic/param/media",
        value: "neon-k7f3/alt",
      },
    ],
  });
}

const packs: PacksView = {
  "neon-k7f3": {
    status: "ok",
    entries: {
      logo: { type: "image", status: "ok", fingerprint: "aaaaaaaaaaaaaaaa-1" },
      alt: { type: "image", status: "ok", fingerprint: "bbbbbbbbbbbbbbbb-1" },
      gone: {
        type: "image",
        status: "missing",
        fingerprint: "cccccccccccccccc-1",
      },
      tunnel: {
        type: "video",
        status: "ok",
        fingerprint: "dddddddddddddddd-9",
        beats: 16,
      },
    },
  },
  lost: { status: "missing", entries: {} },
};
const url = (reference: string): string => `/packs/${reference}`;

describe("packSources", () => {
  it("makes one source per reference the Layers and Macro actions name, keyed by reference", () => {
    const sources = packSources(
      installation("neon-k7f3/logo", "neon-k7f3/tunnel"),
      catalog,
      packs,
      url,
    );
    expect(sources).toEqual({
      "neon-k7f3/logo": {
        type: "image",
        url: "/packs/neon-k7f3/logo",
        revision: "aaaaaaaaaaaaaaaa-1",
        beats: undefined,
      },
      "neon-k7f3/alt": {
        type: "image",
        url: "/packs/neon-k7f3/alt",
        revision: "bbbbbbbbbbbbbbbb-1",
        beats: undefined,
      },
      "neon-k7f3/tunnel": {
        type: "video",
        url: "/packs/neon-k7f3/tunnel",
        revision: "dddddddddddddddd-9",
        beats: { beats: 16, firstBeat: 0 },
      },
    });
  });

  it("gives no source for a missing entry, a missing Pack, an unloaded Pack, a wrong type or an unreachable file", () => {
    const missingEntry = installation("neon-k7f3/gone", "neon-k7f3/tunnel");
    expect(
      Object.keys(packSources(missingEntry, catalog, packs, url)).sort(),
    ).toEqual(["neon-k7f3/alt", "neon-k7f3/tunnel"]);
    const missingPack = installation("lost/logo", "elsewhere/clip");
    expect(Object.keys(packSources(missingPack, catalog, packs, url))).toEqual([
      "neon-k7f3/alt",
    ]);
    // A video entry on an image Parameter, and an image entry on a video one.
    const wrongType = installation("neon-k7f3/tunnel", "neon-k7f3/logo");
    expect(Object.keys(packSources(wrongType, catalog, packs, url))).toEqual([
      "neon-k7f3/alt",
    ]);
    const unreachable = packSources(
      installation("neon-k7f3/logo", "neon-k7f3/tunnel"),
      catalog,
      packs,
      () => undefined,
    );
    expect(unreachable).toEqual({});
    const noPacks = packSources(
      installation("neon-k7f3/logo", "neon-k7f3/tunnel"),
      catalog,
      {},
      url,
    );
    expect(noPacks).toEqual({});
  });

  it("reads an entry's beats and first beat as the slice has them now", () => {
    const edited: PacksView = {
      "neon-k7f3": {
        status: "ok",
        entries: {
          tunnel: {
            type: "video",
            status: "ok",
            fingerprint: "dddddddddddddddd-9",
            beats: 8,
            firstBeat: 0.5,
          },
        },
      },
    };
    const sources = packSources(
      installation("", "neon-k7f3/tunnel"),
      catalog,
      edited,
      url,
    );
    expect(sources["neon-k7f3/tunnel"]?.beats).toEqual({
      beats: 8,
      firstBeat: 0.5,
    });
    // The same fingerprint: the loader keeps the element and only the beats change.
    expect(sources["neon-k7f3/tunnel"]?.revision).toBe("dddddddddddddddd-9");
  });

  it("finds an entry by reference only while its Pack is there and its file is", () => {
    expect(entryOf(packs, "neon-k7f3/logo")?.type).toBe("image");
    expect(entryOf(packs, "neon-k7f3/gone")).toBeUndefined();
    expect(entryOf(packs, "neon-k7f3/nope")).toBeUndefined();
    expect(entryOf(packs, "lost/logo")).toBeUndefined();
    expect(entryOf(packs, "not a reference")).toBeUndefined();
    expect(entryOf(packs, "")).toBeUndefined();
  });

  it("makes up a loaded Pack per reference for a page without a runtime", () => {
    const fake = fakePacks({
      "sample/pic": "image",
      "sample/clip": "video",
      share_a: "image",
    });
    expect(Object.keys(fake)).toEqual(["sample"]);
    expect(entryOf(fake, "sample/pic")?.type).toBe("image");
    expect(entryOf(fake, "sample/clip")?.type).toBe("video");
    expect(entryOf(fake, "share_a")).toBeUndefined();
  });
});
