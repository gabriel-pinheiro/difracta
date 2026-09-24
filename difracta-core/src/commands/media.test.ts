import { describe, expect, it } from "vitest";

import { listAddresses, resolveAddress } from "../address/address.ts";
import { actionProblem } from "../address/fire.ts";
import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { DocumentSchema } from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { createBuiltInRegistry } from "./index.ts";

const picture: VisualDefinition = {
  kind: "visual",
  id: "picture",
  name: "Picture",
  description: "Shows an image.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "image", label: "Image", default: "" },
    opacity: { kind: "number", label: "Level", default: 1, min: 0, max: 1 },
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
    ["media.create", { id: "m_logo", path: "art\\Logo.PNG" }],
    [
      "media.create",
      { id: "m_loop", path: "../shared/loop.mp4", name: "Loop" },
    ],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "layer", sceneId: "scene", kind: "visual" }],
    ["layer.visual", { layerId: "layer", visual: "picture" }],
    ["controller.create", { id: "ctl", kind: "number", name: "Energy" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

function layerOf(document: Document) {
  const layer = document.layers.layer;
  if (layer?.kind !== "visual") throw new Error("Visual Layer expected.");
  return layer;
}

describe("Media items", () => {
  it("has an empty table in a new Document", () => {
    expect(emptyDocument("x").media).toEqual({});
    expect(DocumentSchema.safeParse(installation()).success).toBe(true);
  });

  it("creates items named after their file, with POSIX paths, in order", () => {
    const document = installation();
    expect(document.media.m_logo).toMatchObject({
      name: "Logo",
      path: "art/Logo.PNG",
    });
    expect(document.media.m_loop).toMatchObject({
      name: "Loop",
      path: "../shared/loop.mp4",
    });
    expect(orderedEntries(document.media).map((item) => item.id)).toEqual([
      "m_logo",
      "m_loop",
    ]);
    const created = run(emptyDocument("x"), "media.create", {
      path: "./a/b.webp",
    });
    expect(created.label).toBe("Add Media “b”");
    const again = run(document, "media.create", { path: "other/logo.png" });
    expect(Object.values(again.document.media).map((m) => m.name)).toContain(
      "logo 1",
    );
    expect(refuse(document, "media.create", { path: "notes.txt" })).toContain(
      "not an image or video",
    );
    expect(refuse(document, "media.create", { path: "." })).toContain(
      "must name a file",
    );
    expect(
      refuse(document, "media.create", { id: "m_logo", path: "x.png" }),
    ).toContain("already exists");
  });

  it("renames and moves items and refuses unknown ones", () => {
    let document = installation();
    document = run(document, "media.rename", {
      mediaId: "m_logo",
      name: "loop",
    }).document;
    expect(document.media.m_logo?.name).toBe("loop 1");
    expect(
      run(document, "media.rename", { mediaId: "m_logo", name: "loop 1" })
        .patches,
    ).toEqual([]);
    document = run(document, "entity.move", {
      table: "media",
      id: "m_loop",
      after: null,
    }).document;
    expect(orderedEntries(document.media).map((item) => item.id)).toEqual([
      "m_loop",
      "m_logo",
    ]);
    expect(
      refuse(document, "media.rename", { mediaId: "nope", name: "x" }),
    ).toContain("does not exist");
  });

  it("resolves a media Address with none and the items of the accepted kind", () => {
    const document = installation();
    const resolved = resolveAddress(
      document,
      "layer/layer/param/media",
      catalog,
    );
    expect(resolved).toMatchObject({
      type: "media",
      accepts: "image",
      default: "",
      options: [
        { value: "", label: "None" },
        { value: "m_logo", label: "Logo" },
      ],
    });
    expect(
      listAddresses(document, catalog).map((entry) => entry.address),
    ).toContain("layer/layer/param/media");
    const video = run(document, "layer.visual", {
      layerId: "layer",
      visual: "clip",
    }).document;
    expect(
      resolveAddress(video, "layer/layer/param/media", catalog)?.options,
    ).toEqual([
      { value: "", label: "None" },
      { value: "m_loop", label: "Loop" },
    ]);
  });

  it("writes an existing item of the right kind, or none, and nothing else", () => {
    let document = installation();
    for (const command of ["address.set", "address.edit"]) {
      const written = run(document, command, {
        address: "layer/layer/param/media",
        value: "m_logo",
      });
      expect(layerOf(written.document).parameters.media).toBe("m_logo");
      expect(
        refuse(document, command, {
          address: "layer/layer/param/media",
          value: "m_loop",
        }),
      ).toContain("an image Media item: m_logo");
      expect(
        refuse(document, command, {
          address: "layer/layer/param/media",
          value: "m_missing",
        }),
      ).toContain('must be "" for none');
      expect(
        refuse(document, command, {
          address: "layer/layer/param/media",
          value: 3,
        }),
      ).toContain("Image must be");
    }
    document = run(document, "address.edit", {
      address: "layer/layer/param/media",
      value: "m_logo",
    }).document;
    document = run(document, "address.set", {
      address: "layer/layer/param/media",
      value: "",
    }).document;
    expect(layerOf(document).parameters.media).toBe("");
    expect(
      refuse(document, "address.toggle", {
        address: "layer/layer/param/media",
      }),
    ).toContain("not a boolean");
  });

  it("is checked by layer.visual and reset by layer.reset like any Parameter", () => {
    let document = installation();
    document = run(document, "layer.visual", {
      layerId: "layer",
      visual: "picture",
      parameters: { media: "m_logo" },
    }).document;
    expect(layerOf(document).parameters).toEqual({
      media: "m_logo",
      opacity: 1,
    });
    expect(
      refuse(document, "layer.visual", {
        layerId: "layer",
        visual: "picture",
        parameters: { media: "m_loop" },
      }),
    ).toContain("Parameter “media” must be");
    expect(
      refuse(document, "layer.visual", {
        layerId: "layer",
        visual: "picture",
        parameters: { media: 1 },
      }),
    ).toContain("Parameter “media”");
    document = run(document, "layer.reset", { layerId: "layer" }).document;
    expect(layerOf(document).parameters.media).toBe("");
    // Picking the video Visual drops the image id with the rest of the values.
    const swapped = run(document, "layer.visual", {
      layerId: "layer",
      visual: "clip",
    }).document;
    expect(layerOf(swapped).parameters).toEqual({ media: "" });
  });

  it("cannot be linked to a Controller", () => {
    const document = installation();
    expect(
      refuse(document, "link.create", {
        controllerId: "ctl",
        addresses: ["layer/layer/param/media"],
      }),
    ).toContain("cannot be linked");
  });

  it("captures and checks Macro set actions", () => {
    let document = installation();
    document = run(document, "macro.create", {
      id: "macro",
      kind: "macro",
      name: "Swap",
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "macro",
      actions: [
        { kind: "set", address: "layer/layer/param/media", value: "m_logo" },
      ],
    }).document;
    const macro = document.macros.macro;
    if (macro?.kind !== "macro") throw new Error("Macro expected.");
    const action = macro.actions[0];
    if (action?.kind !== "set") throw new Error("Set action expected.");
    expect(actionProblem(document, catalog, action)).toBeUndefined();
    expect(
      actionProblem(document, catalog, { ...action, value: "m_loop" }),
    ).toContain("The value must be");
    const fired = run(document, "address.trigger", {
      address: "macro/macro/run",
    });
    expect(layerOf(fired.document).parameters.media).toBe("m_logo");
    // Removing the item takes the action with it.
    const removed = run(fired.document, "media.remove", {
      mediaId: "m_logo",
    }).document;
    const after = removed.macros.macro;
    expect(after?.kind === "macro" ? after.actions : undefined).toEqual([]);
  });

  it("clears Parameters holding a removed item, or one whose kind changed", () => {
    let document = installation();
    document = run(document, "address.edit", {
      address: "layer/layer/param/media",
      value: "m_logo",
    }).document;
    const removed = run(document, "media.remove", { mediaId: "m_logo" });
    expect(removed.document.media.m_logo).toBeUndefined();
    expect(layerOf(removed.document).parameters.media).toBe("");
    expect(removed.patches[0]).toEqual({
      op: "set",
      path: ["layers", "layer", "parameters", "media"],
      value: "",
    });
    // The other item is untouched, and so is a Layer holding nothing.
    expect(
      run(document, "media.remove", { mediaId: "m_loop" }).patches,
    ).toEqual([{ op: "remove", path: ["media", "m_loop"] }]);
    expect(refuse(document, "media.remove", { mediaId: "nope" })).toContain(
      "does not exist",
    );

    const repointed = run(document, "media.path", {
      mediaId: "m_logo",
      path: "art/logo.webp",
    });
    expect(repointed.document.media.m_logo?.path).toBe("art/logo.webp");
    expect(layerOf(repointed.document).parameters.media).toBe("m_logo");
    expect(
      run(document, "media.path", { mediaId: "m_logo", path: "art/Logo.PNG" })
        .patches,
    ).toEqual([]);
    const turnedVideo = run(document, "media.path", {
      mediaId: "m_logo",
      path: "art/logo.mp4",
    }).document;
    expect(layerOf(turnedVideo).parameters.media).toBe("");
    expect(
      refuse(document, "media.path", { mediaId: "m_logo", path: "x.doc" }),
    ).toContain("not an image or video");
  });
});
