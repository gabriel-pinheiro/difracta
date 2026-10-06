import { describe, expect, it } from "vitest";

import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import { RESOLUTION_OPTIONS } from "../packs/proxies.ts";
import { emptyDocument } from "./document.ts";
import { catalog, installation } from "./media-uses-fixture.ts";
import { mediaReferencesInUse, rewriteUses, usesOf } from "./media-uses.ts";

describe("the Media references in use", () => {
  it("lists every Layer Parameter and Macro set action holding one, empty ones left out", () => {
    const uses = mediaReferencesInUse(installation(), catalog);
    // Layers in navigator order, the newest on top, then the Macros.
    expect(uses.map((use) => `${use.kind}:${use.reference}`)).toEqual([
      "layer:share_a",
      "layer:bundled/beam",
      "layer:neon-k7f3/logo",
      "layer:neon-k7f3/logo",
      "macro:neon-k7f3/logo",
      "macro:share_a",
    ]);
    expect(uses[3]).toEqual({
      kind: "layer",
      reference: "neon-k7f3/logo",
      accepts: "image",
      layerId: "l_a",
      parameter: "media",
      label: "Image",
    });
    expect(uses[4]).toEqual({
      kind: "macro",
      reference: "neon-k7f3/logo",
      accepts: "image",
      macroId: "m",
      action: 0,
      layerId: "l_a",
    });
  });

  it("carries the Layer's Resolution when the Parameter names one, for a Macro's action too", () => {
    const movie: VisualDefinition = {
      kind: "visual",
      id: "movie",
      name: "Movie",
      description: "Plays a video.",
      backend: "shader",
      parameters: {
        media: {
          kind: "media",
          accepts: "video",
          label: "Video",
          default: "",
          resolution: "resolution",
        },
        resolution: {
          kind: "choice",
          label: "Resolution",
          default: "auto",
          options: RESOLUTION_OPTIONS,
        },
      },
    };
    const movies = new Catalog({ visuals: [movie] });
    const registry = createBuiltInRegistry(movies);
    let document = emptyDocument("Living");
    for (const [name, payload] of [
      ["scene.create", { id: "scene", name: "Main" }],
      ["layer.create", { id: "l_m", sceneId: "scene", kind: "visual" }],
      [
        "layer.visual",
        {
          layerId: "l_m",
          visual: "movie",
          parameters: { media: "neon-k7f3/loop", resolution: "720" },
        },
      ],
      ["macro.create", { id: "m", name: "Swap" }],
      [
        "macro.actions.add",
        {
          macroId: "m",
          actions: [
            {
              address: "layer/l_m/param/media",
              kind: "set",
              value: "neon-k7f3/hit",
            },
          ],
        },
      ],
    ] as const) {
      const result = executeCommand(registry, document, name, payload);
      if (!result.ok) throw new Error(result.error);
      document = result.document;
    }
    expect(mediaReferencesInUse(document, movies)).toEqual([
      expect.objectContaining({
        kind: "layer",
        reference: "neon-k7f3/loop",
        layerId: "l_m",
        resolution: "720",
      }),
      expect.objectContaining({
        kind: "macro",
        reference: "neon-k7f3/hit",
        layerId: "l_m",
        resolution: "720",
      }),
    ]);
    // A Layer saved before its Visual had the Parameter reads its default.
    const saved = document.layers.l_m;
    if (saved?.kind !== "visual") throw new Error("no Layer");
    const { resolution: _, ...parameters } = saved.parameters;
    const before = {
      ...document,
      layers: { ...document.layers, l_m: { ...saved, parameters } },
    };
    expect(mediaReferencesInUse(before, movies)[0]).toEqual(
      expect.objectContaining({ layerId: "l_m", resolution: "auto" }),
    );
  });

  it("rewrites the uses of one reference, a Macro's actions as one list", () => {
    const document = installation();
    const patches = rewriteUses(
      document,
      usesOf(document, catalog, "neon-k7f3/logo"),
      "neon-k7f3/logo-2",
    );
    expect(patches).toEqual([
      {
        op: "set",
        path: ["layers", "l_b", "parameters", "media"],
        value: "neon-k7f3/logo-2",
      },
      {
        op: "set",
        path: ["layers", "l_a", "parameters", "media"],
        value: "neon-k7f3/logo-2",
      },
      {
        op: "set",
        path: ["macros", "m", "actions"],
        value: [
          expect.objectContaining({
            address: "layer/l_a/param/media",
            value: "neon-k7f3/logo-2",
          }),
          expect.objectContaining({
            address: "layer/l_a/param/speed",
            value: 2,
          }),
          expect.objectContaining({
            address: "layer/l_live/param/media",
            value: "share_a",
          }),
          expect.objectContaining({
            address: "layer/l_b/param/media",
            value: "",
          }),
        ],
      },
    ]);
  });
});
