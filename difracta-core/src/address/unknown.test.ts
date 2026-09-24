import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { fireAddress } from "./fire.ts";
import { toggleAddress, writeAddress } from "./write.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "koi-pond",
      name: "Koi Pond",
      description: "Fish.",
      backend: "canvas",
      parameters: {
        count: { kind: "number", label: "Fish", default: 8, min: 1, max: 40 },
        wander: { kind: "boolean", label: "Wander", default: true },
      },
      cues: [{ key: "scatter", label: "Scatter" }],
    },
    {
      kind: "visual",
      id: "still",
      name: "Still",
      description: "Nothing to move.",
      backend: "canvas",
      parameters: {},
    },
  ],
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function stage(): Document {
  let document = emptyDocument("Pond");
  document = run(document, "scene.create", { id: "s", name: "Live" });
  for (const [id, visual] of [
    ["k", "koi-pond"],
    ["q", "still"],
  ] as const) {
    document = run(document, "layer.create", {
      id,
      sceneId: "s",
      kind: "visual",
    });
    document = run(document, "layer.visual", { layerId: id, visual });
  }
  document = run(document, "layer.create", {
    id: "e",
    sceneId: "s",
    kind: "visual",
    name: "Empty",
  });
  document = run(document, "layer.create", {
    id: "g",
    sceneId: "s",
    kind: "group",
    name: "Pack",
  });
  return document;
}

function error(outcome: { ok: boolean; error?: string }): string | undefined {
  return outcome.ok ? undefined : outcome.error;
}

describe("unknown addresses", () => {
  const document = stage();

  it("lists the Parameters a Layer's Visual declares, and where to read them", () => {
    const expected =
      "Unknown address “layer/k/param/fish”: Koi Pond declares the Parameters count, wander. See `difracta catalog koi-pond`.";
    expect(
      error(writeAddress(document, catalog, "layer/k/param/fish", 3)),
    ).toBe(expected);
    expect(error(toggleAddress(document, catalog, "layer/k/param/fish"))).toBe(
      expected,
    );
    expect(error(writeAddress(document, catalog, "layer/q/param/x", 1))).toBe(
      "Unknown address “layer/q/param/x”: Still declares no Parameters. See `difracta catalog still`.",
    );
  });

  it("lists the Cues when a trigger names one the Visual does not declare", () => {
    expect(
      error(fireAddress(document, catalog, "layer/k/cue/burst", Math.random)),
    ).toBe(
      "Unknown address “layer/k/cue/burst”: Koi Pond declares the Cues scatter. See `difracta catalog koi-pond`.",
    );
    expect(
      error(fireAddress(document, catalog, "layer/q/cue/burst", Math.random)),
    ).toBe(
      "Unknown address “layer/q/cue/burst”: Still declares no Cues. See `difracta catalog still`.",
    );
  });

  it("says why a Layer has nothing to declare", () => {
    expect(error(writeAddress(document, catalog, "layer/e/param/x", 1))).toBe(
      "Unknown address “layer/e/param/x”: Layer “Empty” has no Visual yet.",
    );
    expect(
      error(fireAddress(document, catalog, "layer/g/cue/x", Math.random)),
    ).toBe(
      "Unknown address “layer/g/cue/x”: Layer “Pack” is a Group; it has no Parameters or Cues.",
    );
  });

  it("keeps the plain message for everything else", () => {
    expect(error(writeAddress(document, catalog, "layer/k/nope", 1))).toBe(
      "Unknown address “layer/k/nope”.",
    );
    expect(
      error(fireAddress(document, catalog, "scene/zz/play", Math.random)),
    ).toBe("Unknown address “scene/zz/play”.");
  });
});
