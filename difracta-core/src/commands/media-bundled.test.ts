import { describe, expect, it } from "vitest";

import { resolveAddress } from "../address/address.ts";
import {
  Catalog,
  type MediaDefinition,
  type VisualDefinition,
} from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  DocumentSchema,
  emptyDocument,
  type Document,
} from "../document/document.ts";
import { mediaItemTypeIn } from "../document/media.ts";
import { createBuiltInRegistry } from "./index.ts";

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
const flash: MediaDefinition = {
  kind: "media",
  id: "flash-cut",
  name: "Flash Cut",
  description: "A white flash.",
  type: "video",
  hit: true,
  file: "clips/flash-cut.webm",
  width: 1920,
  height: 1080,
  duration: 1,
};
const grid: MediaDefinition = {
  kind: "media",
  id: "grid",
  name: "Grid",
  description: "A still grid.",
  type: "image",
  file: "clips/grid.png",
  width: 1920,
  height: 1080,
};
const catalog = new Catalog({ visuals: [clip], media: [flash, grid] });
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

/** A bundled Flash Cut, a file clip, and a Clip Layer showing the bundled one. */
function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["media.create", { id: "m_flash", kind: "bundled", bundled: "flash-cut" }],
    ["media.create", { id: "m_loop", path: "loop.webm" }],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "layer", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      { layerId: "layer", visual: "clip", parameters: { media: "m_flash" } },
    ],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

function valueOf(document: Document): unknown {
  const layer = document.layers.layer;
  return layer?.kind === "visual" ? layer.parameters.media : undefined;
}

describe("bundled Media items", () => {
  it("are created from a Catalog entry, named after it", () => {
    const document = installation();
    expect(document.media.m_flash).toMatchObject({
      kind: "bundled",
      name: "Flash Cut",
      bundled: "flash-cut",
      parentId: null,
    });
    expect(DocumentSchema.safeParse(document).success).toBe(true);
    const named = run(document, "media.create", {
      kind: "bundled",
      bundled: "grid",
      name: "Backdrop",
    });
    expect(named.label).toBe("Add Bundled Media “Backdrop”");
    expect(Object.values(named.document.media).map((m) => m.name)).toContain(
      "Backdrop",
    );
  });

  it("refuses a bundled item without an entry, with a path, or with an unknown entry", () => {
    const document = emptyDocument("x");
    expect(refuse(document, "media.create", { kind: "bundled" })).toContain(
      "needs the id of a Bundled Media entry",
    );
    expect(
      refuse(document, "media.create", {
        kind: "bundled",
        bundled: "flash-cut",
        path: "a.webm",
      }),
    ).toContain("has no path");
    expect(
      refuse(document, "media.create", { kind: "bundled", bundled: "nope" }),
    ).toContain("not in the Bundled Media");
    expect(
      refuse(document, "media.create", { path: "a.webm", bundled: "grid" }),
    ).toContain("names no Bundled Media entry");
    expect(
      refuse(document, "media.create", { kind: "group", bundled: "grid" }),
    ).toContain("names no Bundled Media entry");
  });

  it("take their type from the Catalog, and are offered and accepted by it", () => {
    const document = installation();
    const item = document.media.m_flash;
    if (item === undefined) throw new Error("Item expected.");
    expect(mediaItemTypeIn(item, catalog)).toBe("video");
    expect(valueOf(document)).toBe("m_flash");
    expect(
      resolveAddress(document, "layer/layer/param/media", catalog)?.options,
    ).toEqual([
      { value: "", label: "None" },
      { value: "m_flash", label: "Flash Cut" },
      { value: "m_loop", label: "loop" },
    ]);
  });

  it("stay in the document when the Catalog lacks their entry, of no type", () => {
    const lacking = createBuiltInRegistry(new Catalog({ visuals: [clip] }));
    const document = installation();
    const item = document.media.m_flash;
    if (item === undefined) throw new Error("Item expected.");
    expect(mediaItemTypeIn(item, new Catalog())).toBeUndefined();
    expect(
      resolveAddress(document, "layer/layer/param/media", lacking.catalog)
        ?.options,
    ).toEqual([
      { value: "", label: "None" },
      { value: "m_loop", label: "loop" },
    ]);
    const result = executeCommand(lacking, document, "layer.visual", {
      layerId: "layer",
      visual: "clip",
      parameters: { media: "m_flash" },
    });
    expect(result.ok ? "" : result.error).toContain("which this runtime lacks");
    const renamed = executeCommand(lacking, document, "media.rename", {
      mediaId: "m_flash",
      name: "Old",
    });
    expect(renamed.ok).toBe(true);
  });

  it("swap their entry with media.bundled, clearing Parameters when the type changes", () => {
    const document = installation();
    const same = run(document, "media.bundled", {
      mediaId: "m_flash",
      bundled: "flash-cut",
    });
    expect(same.patches).toEqual([]);
    const image = run(document, "media.bundled", {
      mediaId: "m_flash",
      bundled: "grid",
    });
    expect(image.document.media.m_flash).toMatchObject({
      bundled: "grid",
      name: "Grid",
    });
    expect(valueOf(image.document)).toBe("");
    const back = run(image.document, "media.bundled", {
      mediaId: "m_flash",
      bundled: "flash-cut",
    });
    expect(back.patches).toEqual([
      { op: "set", path: ["media", "m_flash", "bundled"], value: "flash-cut" },
      { op: "set", path: ["media", "m_flash", "name"], value: "Flash Cut" },
    ]);
  });

  it("keep a name the person gave, and follow from a numbered one", () => {
    let document = installation();
    document = run(document, "media.create", {
      id: "m_second",
      kind: "bundled",
      bundled: "flash-cut",
    }).document;
    expect(document.media.m_second?.name).toBe("Flash Cut 1");
    const followed = run(document, "media.bundled", {
      mediaId: "m_second",
      bundled: "grid",
    }).document;
    expect(followed.media.m_second?.name).toBe("Grid");
    const renamed = run(document, "media.rename", {
      mediaId: "m_flash",
      name: "Opening hit",
    }).document;
    const kept = run(renamed, "media.bundled", {
      mediaId: "m_flash",
      bundled: "grid",
    }).document;
    expect(kept.media.m_flash?.name).toBe("Opening hit");
  });

  it("refuse media.path, and media.bundled refuses files, Groups and unknown entries", () => {
    let document = installation();
    document = run(document, "media.create", {
      id: "g_art",
      kind: "group",
      name: "Art",
    }).document;
    expect(
      refuse(document, "media.path", { mediaId: "m_flash", path: "a.webm" }),
    ).toContain("media.bundled changes its entry");
    expect(
      refuse(document, "media.bundled", { mediaId: "m_loop", bundled: "grid" }),
    ).toContain("is a Media file");
    expect(
      refuse(document, "media.bundled", { mediaId: "g_art", bundled: "grid" }),
    ).toContain("is a Media Group");
    expect(
      refuse(document, "media.bundled", { mediaId: "m_flash", bundled: "no" }),
    ).toContain("not in the Bundled Media");
    expect(
      refuse(document, "media.bundled", { mediaId: "nope", bundled: "grid" }),
    ).toContain("does not exist");
  });

  it("are removed like files, clearing what held them", () => {
    const removed = run(installation(), "media.remove", {
      mediaId: "m_flash",
    }).document;
    expect(removed.media.m_flash).toBeUndefined();
    expect(valueOf(removed)).toBe("");
  });
});
