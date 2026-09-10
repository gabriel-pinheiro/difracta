import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  type Document,
  type FilterLayer,
  type VisualLayer,
} from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "stars",
      name: "Stars",
      description: "Points of light.",
      backend: "canvas",
      parameters: {
        count: {
          kind: "number",
          label: "Count",
          default: 50,
          min: 1,
          max: 500,
        },
        tint: { kind: "color", label: "Tint", default: [1, 1, 1, 1] },
      },
    },
    {
      kind: "visual",
      id: "plasma",
      name: "Plasma",
      description: "Flowing color.",
      backend: "shader",
      parameters: {
        speed: { kind: "number", label: "Speed", default: 1, min: 0, max: 4 },
      },
    },
  ],
  filters: [
    {
      kind: "filter",
      id: "blur",
      name: "Blur",
      description: "Softens.",
      backend: "shader",
      parameters: {
        radius: {
          kind: "number",
          label: "Radius",
          default: 4,
          min: 0,
          max: 64,
        },
      },
    },
  ],
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function fails(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function scene(): Document {
  let document = emptyDocument("Living");
  document = run(document, "scene.create", { id: "s", name: "Live" });
  document = run(document, "layer.create", {
    id: "a",
    kind: "visual",
    sceneId: "s",
  });
  document = run(document, "layer.create", {
    id: "f",
    kind: "filter",
    sceneId: "s",
  });
  return document;
}

const visual = (document: Document, id: string): VisualLayer =>
  document.layers[id] as VisualLayer;
const filter = (document: Document, id: string): FilterLayer =>
  document.layers[id] as FilterLayer;

describe("layer.visual and layer.filter", () => {
  it("sets the definition with its defaults and renames a generated name", () => {
    let document = scene();
    expect(visual(document, "a").name).toBe("Layer");
    document = run(document, "layer.visual", { layerId: "a", visual: "stars" });
    expect(visual(document, "a")).toMatchObject({
      name: "Stars",
      visual: "stars",
      parameters: { count: 50, tint: [1, 1, 1, 1] },
    });
    document = run(document, "layer.filter", { layerId: "f", filter: "blur" });
    expect(filter(document, "f")).toMatchObject({
      name: "Blur",
      filter: "blur",
      parameters: { radius: 4 },
    });
  });

  it("follows the definition's name while the name was never typed, with a counter when taken", () => {
    let document = scene();
    document = run(document, "layer.create", {
      id: "b",
      kind: "visual",
      sceneId: "s",
      name: "Plasma",
    });
    document = run(document, "layer.visual", { layerId: "a", visual: "stars" });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "plasma",
    });
    expect(visual(document, "a").name).toBe("Plasma 1");
    document = run(document, "layer.visual", { layerId: "a", visual: "stars" });
    expect(visual(document, "a").name).toBe("Stars");
    document = run(document, "layer.rename", { layerId: "a", name: "Ceiling" });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "plasma",
    });
    expect(visual(document, "a").name).toBe("Ceiling");
    // A generated "Layer 2" also counts as never typed.
    document = run(document, "layer.create", {
      id: "c",
      kind: "visual",
      sceneId: "s",
      name: "Layer 2",
    });
    document = run(document, "layer.visual", { layerId: "c", visual: "stars" });
    expect(visual(document, "c").name).toBe("Stars");
  });

  it("resets Parameters on every change and puts given values back as they were", () => {
    let document = scene();
    document = run(document, "layer.visual", { layerId: "a", visual: "stars" });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "stars",
      parameters: { count: 7, tint: [0, 0, 0, 1] },
    });
    expect(visual(document, "a").parameters).toEqual({
      count: 7,
      tint: [0, 0, 0, 1],
    });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "plasma",
    });
    expect(visual(document, "a").parameters).toEqual({ speed: 1 });
    document = run(document, "layer.visual", { layerId: "a", visual: null });
    expect(visual(document, "a")).toMatchObject({
      visual: null,
      parameters: {},
      name: "Layer",
    });
  });

  it("is a no-op for the same definition without values, and coalesces per Layer", () => {
    const document = run(scene(), "layer.visual", {
      layerId: "a",
      visual: "stars",
    });
    const again = executeCommand(registry, document, "layer.visual", {
      layerId: "a",
      visual: "stars",
    });
    expect(again.ok && again.patches).toEqual([]);
    expect(again.ok && again.coalesceKey).toBe("layer.visual:a");
  });

  it("rejects unknown ids, wrong kinds, and values that do not fit", () => {
    const document = scene();
    expect(
      fails(document, "layer.visual", { layerId: "a", visual: "nope" }),
    ).toBe("Visual “nope” is not in the Catalog.");
    expect(
      fails(document, "layer.visual", { layerId: "f", visual: "stars" }),
    ).toBe("Only Visual Layers have a Visual.");
    expect(
      fails(document, "layer.filter", { layerId: "a", filter: "blur" }),
    ).toBe("Only Filter Layers have a Filter.");
    expect(
      fails(document, "layer.visual", {
        layerId: "a",
        visual: "stars",
        parameters: { count: 7 },
      }),
    ).toBe("Parameter “tint” is missing.");
    expect(
      fails(document, "layer.visual", {
        layerId: "a",
        visual: null,
        parameters: { count: 7 },
      }),
    ).toBe("A Layer without a Visual has no Parameters.");
  });

  it("duplicates carry their Parameters", () => {
    let document = run(scene(), "layer.visual", {
      layerId: "a",
      visual: "stars",
      parameters: { count: 3, tint: [1, 0, 0, 1] },
    });
    document = run(document, "layer.duplicate", { layerId: "a" });
    const copies = Object.values(document.layers).filter(
      (layer): layer is VisualLayer =>
        layer.kind === "visual" && layer.visual === "stars",
    );
    expect(copies).toHaveLength(2);
    expect(copies.map((layer) => layer.parameters)).toEqual([
      { count: 3, tint: [1, 0, 0, 1] },
      { count: 3, tint: [1, 0, 0, 1] },
    ]);
  });
});
