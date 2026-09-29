import { describe, expect, it } from "vitest";

import { resolveAddress } from "../address/address.ts";
import { actionProblem } from "../address/fire.ts";
import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { validateParameterValue } from "../catalog/parameters.ts";
import { executeCommand } from "../command/execute.ts";
import {
  DocumentSchema,
  emptyDocument,
  type Document,
} from "../document/document.ts";
import {
  childMedia,
  mediaBeatsIn,
  mediaItemType,
  mediaValueProblem,
} from "../document/media.ts";
import { createBuiltInRegistry } from "./index.ts";

const live: VisualDefinition = {
  kind: "visual",
  id: "live",
  name: "Live",
  description: "Shows a live item.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "live", label: "Media", default: "" },
  },
};
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
const catalog = new Catalog({ visuals: [live, picture] });
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

/** Screen Share and logo at the root, a Group, a Live Layer and a Picture Layer. */
function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["media.create", { id: "m_share", kind: "share" }],
    ["media.create", { id: "m_logo", path: "logo.png" }],
    ["media.create", { id: "g_art", kind: "group", name: "Art" }],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "l_live", sceneId: "scene", kind: "visual" }],
    ["layer.visual", { layerId: "l_live", visual: "live" }],
    ["layer.create", { id: "l_pic", sceneId: "scene", kind: "visual" }],
    ["layer.visual", { layerId: "l_pic", visual: "picture" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const parameterOf = (document: Document, layerId: string): unknown => {
  const layer = document.layers[layerId];
  return layer?.kind === "visual" ? layer.parameters.media : undefined;
};

describe("Screen Shares", () => {
  it("are created as named slots of type live, numbered like any name", () => {
    let document = installation();
    const { order, ...share } = document.media.m_share ?? {};
    expect(typeof order).toBe("string");
    expect(share).toEqual({
      id: "m_share",
      kind: "share",
      name: "Screen Share",
      parentId: null,
    });
    const item = document.media.m_share;
    if (item === undefined) throw new Error("No Screen Share.");
    expect(mediaItemType(item)).toBe("live");
    expect(mediaBeatsIn(item, catalog)).toBeUndefined();
    const created = run(document, "media.create", {
      kind: "share",
      parentId: "g_art",
    });
    expect(created.label).toBe("Add Screen Share");
    document = run(created.document, "media.create", {
      id: "m_second",
      kind: "share",
    }).document;
    expect(document.media.m_second?.name).toBe("Screen Share 1");
    document = run(document, "media.create", {
      kind: "share",
      name: "Slides",
    }).document;
    expect(childMedia(document.media, null).map((i) => i.name)).toEqual([
      "Screen Share",
      "logo",
      "Art",
      "Screen Share 1",
      "Slides",
    ]);
    expect(DocumentSchema.safeParse(document).success).toBe(true);
  });

  it("refuse a path, an entry, beats and a new file or entry by name", () => {
    const document = installation();
    expect(
      refuse(document, "media.create", { kind: "share", path: "a.png" }),
    ).toBe("A Screen Share has no path; a Sharer shares into it.");
    expect(
      refuse(document, "media.create", { kind: "share", bundled: "x" }),
    ).toBe("A Screen Share names no Bundled Media entry.");
    expect(
      refuse(document, "media.path", { mediaId: "m_share", path: "a.png" }),
    ).toBe(
      "“Screen Share” is a Screen Share, which has no path; a Sharer shares into it.",
    );
    expect(
      refuse(document, "media.bundled", { mediaId: "m_share", bundled: "x" }),
    ).toBe("“Screen Share” is a Screen Share, which shows no Bundled Media.");
    expect(
      refuse(document, "media.beats", { mediaId: "m_share", beats: 16 }),
    ).toBe(
      "“Screen Share” is a Screen Share, which has no beats; only a video has beats.",
    );
  });

  it("rename, move, reorder and refuse to ungroup like any item", () => {
    let document = installation();
    document = run(document, "media.rename", {
      mediaId: "m_share",
      name: "Slides",
    }).document;
    document = run(document, "media.move", {
      mediaId: "m_share",
      parentId: "g_art",
      after: null,
    }).document;
    expect(childMedia(document.media, "g_art").map((i) => i.name)).toEqual([
      "Slides",
    ]);
    document = run(document, "media.move", {
      mediaId: "m_share",
      parentId: null,
      after: null,
    }).document;
    document = run(document, "entity.move", {
      table: "media",
      id: "m_share",
      after: "g_art",
    }).document;
    expect(childMedia(document.media, null).map((i) => i.id)).toEqual([
      "m_logo",
      "g_art",
      "m_share",
    ]);
    expect(refuse(document, "media.ungroup", { mediaId: "m_share" })).toContain(
      "is not a Media Group",
    );
    // A Group holding a Screen Share ungroups and removes with it.
    document = run(document, "media.move", {
      mediaId: "m_share",
      parentId: "g_art",
      after: null,
    }).document;
    const ungrouped = run(document, "media.ungroup", { mediaId: "g_art" });
    expect(ungrouped.document.media.m_share?.parentId).toBeNull();
    const removed = run(document, "media.remove", { mediaId: "g_art" });
    expect(removed.document.media.m_share).toBeUndefined();
  });

  it("are offered to and accepted by a Parameter accepting live, and no other", () => {
    let document = installation();
    expect(
      resolveAddress(document, "layer/l_live/param/media", catalog),
    ).toMatchObject({
      type: "media",
      accepts: "live",
      options: [
        { value: "", label: "None" },
        { value: "m_share", label: "Screen Share" },
      ],
    });
    expect(
      resolveAddress(document, "layer/l_pic/param/media", catalog)?.options,
    ).toEqual([
      { value: "", label: "None" },
      { value: "m_logo", label: "logo" },
    ]);
    for (const command of ["address.set", "address.edit"]) {
      expect(
        parameterOf(
          run(document, command, {
            address: "layer/l_live/param/media",
            value: "m_share",
          }).document,
          "l_live",
        ),
      ).toBe("m_share");
      expect(
        refuse(document, command, {
          address: "layer/l_live/param/media",
          value: "m_logo",
        }),
      ).toContain(
        'must be "" for none or the id of a live Media item: m_share',
      );
      expect(
        refuse(document, command, {
          address: "layer/l_pic/param/media",
          value: "m_share",
        }),
      ).toContain("an image Media item: m_logo");
    }
    expect(mediaValueProblem(document, catalog, "image", "m_share")).toBe(
      'must be the id of an image Media item, or "" for none; “Screen Share” is a Screen Share, which is live',
    );
    expect(mediaValueProblem(document, catalog, "live", "m_logo")).toBe(
      'must be the id of a live Media item, or "" for none; “logo” is an image',
    );
    const parameter = live.parameters.media;
    if (parameter === undefined) throw new Error("No Media Parameter.");
    expect(validateParameterValue(parameter, 3)).toBe(
      'must be the id of a live Media item, or "" for none',
    );
    expect(
      refuse(document, "layer.visual", {
        layerId: "l_pic",
        visual: "picture",
        parameters: { media: "m_share" },
      }),
    ).toContain("is a Screen Share");
    document = run(document, "layer.visual", {
      layerId: "l_live",
      visual: "live",
      parameters: { media: "m_share" },
    }).document;
    expect(parameterOf(document, "l_live")).toBe("m_share");
  });

  it("are set by Macros and cleared, with the actions, when removed", () => {
    let document = installation();
    document = run(document, "macro.create", {
      id: "macro",
      kind: "macro",
      name: "Show slides",
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "macro",
      actions: [
        { kind: "set", address: "layer/l_live/param/media", value: "m_share" },
      ],
    }).document;
    const macro = document.macros.macro;
    const action = macro?.kind === "macro" ? macro.actions[0] : undefined;
    if (action?.kind !== "set") throw new Error("Set action expected.");
    expect(actionProblem(document, catalog, action)).toBeUndefined();
    expect(
      actionProblem(document, catalog, {
        ...action,
        address: "layer/l_pic/param/media",
      }),
    ).toContain("The value must be");
    document = run(document, "address.trigger", {
      address: "macro/macro/run",
    }).document;
    expect(parameterOf(document, "l_live")).toBe("m_share");
    const removed = run(document, "media.remove", {
      mediaId: "m_share",
    }).document;
    expect(parameterOf(removed, "l_live")).toBe("");
    const after = removed.macros.macro;
    expect(after?.kind === "macro" ? after.actions : undefined).toEqual([]);
  });

  it("leave files written before them reading as they did", () => {
    const old = {
      ...emptyDocument("Old"),
      media: {
        m_a: { id: "m_a", name: "A", path: "a.png", order: "a0" },
        m_b: {
          id: "m_b",
          kind: "bundled",
          name: "B",
          bundled: "b",
          parentId: "g",
          order: "a0",
        },
        g: { id: "g", kind: "group", name: "G", parentId: null, order: "a1" },
      },
    };
    const parsed = DocumentSchema.parse(old);
    expect(parsed.media).toEqual({
      m_a: {
        id: "m_a",
        kind: "file",
        name: "A",
        parentId: null,
        path: "a.png",
        order: "a0",
      },
      m_b: old.media.m_b,
      g: old.media.g,
    });
    // A Screen Share holds nothing but its place in the tree.
    expect(
      DocumentSchema.safeParse({
        ...emptyDocument("New"),
        media: {
          m_s: {
            id: "m_s",
            kind: "share",
            name: "S",
            parentId: null,
            order: "a0",
            path: "a.png",
          },
        },
      }).success,
    ).toBe(false);
  });
});
