import { describe, expect, it } from "vitest";

import { resolveAddress } from "../address/address.ts";
import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  DocumentSchema,
  emptyDocument,
  type Document,
} from "../document/document.ts";
import { childMedia, flattenMedia } from "../document/media.ts";
import { createBuiltInRegistry } from "./index.ts";

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
const catalog = new Catalog({ visuals: [picture] });
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

/** Root: Logo, Art { Logo (image), Clips { Loop (video) } }, and a Layer showing Art · Logo. */
function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["media.create", { id: "m_logo", path: "logo.png" }],
    [
      "media.create",
      { id: "g_art", kind: "group", name: "Art", after: "m_logo" },
    ],
    [
      "media.create",
      { id: "m_art_logo", path: "art/logo.png", parentId: "g_art" },
    ],
    [
      "media.create",
      {
        id: "g_clips",
        kind: "group",
        name: "Clips",
        parentId: "g_art",
        after: "m_art_logo",
      },
    ],
    ["media.create", { id: "m_loop", path: "loop.mp4", parentId: "g_clips" }],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "layer", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      {
        layerId: "layer",
        visual: "picture",
        parameters: { media: "m_art_logo" },
      },
    ],
    ["macro.create", { id: "macro", kind: "macro", name: "Swap" }],
    [
      "macro.actions.add",
      {
        macroId: "macro",
        actions: [
          {
            kind: "set",
            address: "layer/layer/param/media",
            value: "m_art_logo",
          },
          { kind: "set", address: "layer/layer/param/media", value: "m_logo" },
        ],
      },
    ],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const ids = (document: Document) =>
  flattenMedia(document.media).map((item) => item.id);

describe("Media Groups", () => {
  it("arranges items in a tree with names unique among siblings", () => {
    const document = installation();
    expect(ids(document)).toEqual([
      "m_logo",
      "g_art",
      "m_art_logo",
      "g_clips",
      "m_loop",
    ]);
    const { order, ...group } = document.media.g_art ?? {};
    expect(typeof order).toBe("string");
    expect(group).toEqual({
      id: "g_art",
      kind: "group",
      name: "Art",
      parentId: null,
    });
    expect(document.media.m_art_logo).toMatchObject({
      kind: "file",
      name: "logo",
      parentId: "g_art",
    });
    expect(DocumentSchema.safeParse(document).success).toBe(true);
    const again = run(document, "media.create", {
      path: "other/logo.png",
      parentId: "g_art",
    }).document;
    expect(childMedia(again.media, "g_art").map((item) => item.name)).toEqual([
      "logo",
      "Clips",
      "logo 1",
    ]);
    expect(run(document, "media.create", { kind: "group" }).label).toBe(
      "Add Media Group",
    );
  });

  it("refuses a Group with a path, a file without one, and a parent that is not a Group", () => {
    const document = installation();
    expect(
      refuse(document, "media.create", { kind: "group", path: "a.png" }),
    ).toContain("has no path");
    expect(refuse(document, "media.create", {})).toContain("needs a path");
    expect(
      refuse(document, "media.create", { path: "a.png", parentId: "m_logo" }),
    ).toContain("is not a Media Group");
    expect(
      refuse(document, "media.path", { mediaId: "g_art", path: "a.png" }),
    ).toContain("has no path");
  });

  it("renames among siblings only", () => {
    let document = installation();
    document = run(document, "media.rename", {
      mediaId: "m_art_logo",
      name: "Clips",
    }).document;
    expect(document.media.m_art_logo?.name).toBe("Clips 1");
    document = run(document, "media.rename", {
      mediaId: "m_logo",
      name: "Clips",
    }).document;
    expect(document.media.m_logo?.name).toBe("Clips");
  });

  it("moves across Groups and ungroups", () => {
    let document = installation();
    document = run(document, "media.move", {
      mediaId: "m_logo",
      parentId: "g_clips",
      after: "m_loop",
    }).document;
    expect(childMedia(document.media, "g_clips").map((i) => i.id)).toEqual([
      "m_loop",
      "m_logo",
    ]);
    expect(
      refuse(document, "media.move", {
        mediaId: "g_art",
        parentId: "g_clips",
        after: null,
      }),
    ).toContain("into itself");
    // Within one parent, entity.move reorders siblings as for Macros.
    document = run(document, "entity.move", {
      table: "media",
      id: "m_logo",
      after: null,
    }).document;
    expect(childMedia(document.media, "g_clips").map((i) => i.id)).toEqual([
      "m_logo",
      "m_loop",
    ]);
    document = run(document, "media.ungroup", { mediaId: "g_art" }).document;
    expect(document.media.g_art).toBeUndefined();
    expect(childMedia(document.media, null).map((i) => i.name)).toEqual([
      "logo",
      "Clips",
    ]);
    expect(refuse(document, "media.ungroup", { mediaId: "m_loop" })).toContain(
      "is not a Media Group",
    );
  });

  it("removes a Group with its contents, clearing Parameters and Macro actions", () => {
    const removed = run(installation(), "media.remove", {
      mediaId: "g_art",
    }).document;
    expect(ids(removed)).toEqual(["m_logo"]);
    const layer = removed.layers.layer;
    expect(layer?.kind === "visual" ? layer.parameters.media : null).toBe("");
    const macro = removed.macros.macro;
    expect(
      macro?.kind === "macro"
        ? macro.actions.map((action) => [
            action.kind,
            action.address,
            "value" in action ? action.value : undefined,
          ])
        : undefined,
    ).toEqual([["set", "layer/layer/param/media", "m_logo"]]);
  });

  it("lists only files of the accepted type as options, in tree order, and refuses a Group", () => {
    let document = installation();
    document = run(document, "media.create", {
      id: "m_last",
      path: "last.png",
      after: "g_art",
    }).document;
    expect(
      resolveAddress(document, "layer/layer/param/media", catalog)?.options,
    ).toEqual([
      { value: "", label: "None" },
      { value: "m_logo", label: "logo" },
      { value: "m_art_logo", label: "logo" },
      { value: "m_last", label: "last" },
    ]);
    expect(
      refuse(document, "address.set", {
        address: "layer/layer/param/media",
        value: "g_art",
      }),
    ).toContain("must be");
    expect(
      refuse(document, "layer.visual", {
        layerId: "layer",
        visual: "picture",
        parameters: { media: "g_art" },
      }),
    ).toContain("is a Media Group");
  });

  it("reads items of older files, which have no kind or parent, as files at the root", () => {
    const old = {
      ...emptyDocument("Old"),
      media: { m_a: { id: "m_a", name: "A", path: "a.png", order: "a0" } },
    };
    const parsed = DocumentSchema.parse(old);
    expect(parsed.media.m_a).toEqual({
      id: "m_a",
      kind: "file",
      name: "A",
      parentId: null,
      path: "a.png",
      order: "a0",
    });
  });
});
