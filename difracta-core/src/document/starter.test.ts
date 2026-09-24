import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import { DocumentSchema, tableEntries } from "./document.ts";
import { STARTER_VISUAL, starterDocument } from "./starter.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: STARTER_VISUAL,
      name: "Zoom Rush",
      description: "Bands rush out of the centre.",
      backend: "shader",
      parameters: {
        speed: { kind: "number", label: "Speed", default: 1, min: 0, max: 4 },
        colorA: { kind: "color", label: "Color A", default: [1, 0, 0.5, 1] },
      },
    },
  ],
  filters: [],
});
const registry = createBuiltInRegistry(catalog);

describe("starterDocument", () => {
  it("holds one Output, Surface, Scene and Visual Layer, wired together", () => {
    const document = starterDocument("Living", registry);
    expect(document.installation.name).toBe("Living");

    const [output, ...moreOutputs] = tableEntries(document.outputs);
    const [surface, ...moreSurfaces] = tableEntries(document.surfaces);
    const [scene, ...moreScenes] = tableEntries(document.scenes);
    const [layer, ...moreLayers] = tableEntries(document.layers);
    expect([moreOutputs, moreSurfaces, moreScenes, moreLayers]).toEqual([
      [],
      [],
      [],
      [],
    ]);

    expect(output?.name).toBe("Output 1");
    expect(surface?.name).toBe("Full Frame");
    expect(surface?.output).toBe(output?.id);
    expect(scene?.name).toBe("Scene 1");
    expect(document.installation.activeScene).toBe(scene?.id);
    expect(layer).toMatchObject({
      kind: "visual",
      name: "Zoom Rush",
      sceneId: scene?.id,
      parentId: null,
      target: surface?.id,
      visual: STARTER_VISUAL,
      parameters: { speed: 1, colorA: [1, 0, 0.5, 1] },
    });
  });

  it("generates fresh ids every time", () => {
    const first = starterDocument("A", registry);
    const second = starterDocument("B", registry);
    expect(second.installation.id).not.toBe(first.installation.id);
    for (const table of ["outputs", "surfaces", "scenes", "layers"] as const)
      for (const id of Object.keys(first[table]))
        expect(second[table]).not.toHaveProperty(id);
  });

  it("validates as a Document", () => {
    const document = starterDocument("Living", registry);
    expect(DocumentSchema.safeParse(document).success).toBe(true);
  });

  it("throws when the Catalog lacks the starter Visual", () => {
    expect(() => starterDocument("Living", createBuiltInRegistry())).toThrow(
      /layer\.visual/,
    );
  });
});
