import { describe, expect, it } from "vitest";

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
    });
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
