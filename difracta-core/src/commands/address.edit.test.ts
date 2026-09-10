import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "plasma",
      name: "Plasma",
      description: "Flowing color.",
      backend: "shader",
      parameters: {
        speed: { kind: "number", label: "Speed", default: 1, min: 0, max: 4 },
        tint: { kind: "color", label: "Tint", default: [1, 1, 1, 1] },
      },
    },
  ],
});
const registry = createBuiltInRegistry(catalog);

function execute(document: Document, name: string, payload: unknown) {
  return executeCommand(registry, document, name, payload);
}

function run(document: Document, name: string, payload: unknown): Document {
  const result = execute(document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function fails(document: Document, name: string, payload: unknown): string {
  const result = execute(document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function stage(): Document {
  let document = emptyDocument("Living");
  document = run(document, "scene.create", { id: "s", name: "Live" });
  document = run(document, "layer.create", {
    id: "v",
    sceneId: "s",
    kind: "visual",
  });
  return run(document, "layer.visual", { layerId: "v", visual: "plasma" });
}

const visual = (document: Document) => {
  const layer = document.layers.v;
  if (layer?.kind !== "visual") throw new Error("no visual layer");
  return layer;
};

describe("address.edit", () => {
  it("writes Layer settings and Parameters, labelled by the property", () => {
    const document = stage();
    const opacity = execute(document, "address.edit", {
      address: "layer/v/opacity",
      value: 0.4,
    });
    if (!opacity.ok) throw new Error(opacity.error);
    expect(visual(opacity.document).opacity).toBe(0.4);
    expect(opacity.label).toBe("Change Opacity");
    expect(opacity.coalesceKey).toBe("address.edit:layer/v/opacity");

    const speed = execute(opacity.document, "address.edit", {
      address: "layer/v/param/speed",
      value: 2.5,
    });
    if (!speed.ok) throw new Error(speed.error);
    expect(visual(speed.document).parameters).toEqual({
      speed: 2.5,
      tint: [1, 1, 1, 1],
    });
    expect(speed.label).toBe("Change Speed");

    const blend = run(speed.document, "address.edit", {
      address: "layer/v/blend",
      value: "additive",
    });
    expect(visual(blend).blendMode).toBe("additive");
    const enabled = run(blend, "address.set", {
      address: "layer/v/enabled",
      value: false,
    });
    expect(visual(enabled).enabled).toBe(false);
  });

  it("changes nothing when the value is already there, colors included", () => {
    const document = stage();
    const same = execute(document, "address.edit", {
      address: "layer/v/param/tint",
      value: [1, 1, 1, 1],
    });
    if (!same.ok) throw new Error(same.error);
    expect(same.patches).toEqual([]);
  });

  it("refuses unknown addresses and values the type does not accept", () => {
    const document = stage();
    expect(
      fails(document, "address.edit", { address: "layer/v/nope", value: 1 }),
    ).toBe("Unknown address “layer/v/nope”.");
    expect(
      fails(document, "address.edit", {
        address: "layer/v/param/speed",
        value: 9,
      }),
    ).toBe("Address “layer/v/param/speed” expects a number between 0 and 4.");
    expect(
      fails(document, "address.set", {
        address: "layer/v/opacity",
        value: "1",
      }),
    ).toBe("Address “layer/v/opacity” expects a number.");
  });
});

describe("layer.reset", () => {
  it("puts every Parameter back to its default as one step", () => {
    let document = stage();
    document = run(document, "address.edit", {
      address: "layer/v/param/speed",
      value: 3,
    });
    document = run(document, "address.edit", {
      address: "layer/v/param/tint",
      value: [0, 0, 0, 1],
    });
    const reset = execute(document, "layer.reset", { layerId: "v" });
    if (!reset.ok) throw new Error(reset.error);
    expect(visual(reset.document).parameters).toEqual({
      speed: 1,
      tint: [1, 1, 1, 1],
    });
    expect(reset.label).toBe("Reset Parameters");
  });

  it("refuses Layers without Parameters", () => {
    let document = stage();
    document = run(document, "layer.create", {
      id: "g",
      sceneId: "s",
      kind: "group",
    });
    document = run(document, "layer.create", {
      id: "e",
      sceneId: "s",
      kind: "visual",
    });
    expect(fails(document, "layer.reset", { layerId: "g" })).toBe(
      "A Group has no Parameters.",
    );
    expect(fails(document, "layer.reset", { layerId: "e" })).toBe(
      "The Layer has no Parameters to reset.",
    );
  });
});
