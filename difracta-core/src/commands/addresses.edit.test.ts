import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const crop = (label: string) => ({
  kind: "number" as const,
  label,
  default: 0,
  min: 0,
  max: 1,
  step: 0.0005,
});

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "framed",
      name: "Framed",
      description: "A cropped picture.",
      backend: "shader",
      parameters: {
        cropLeft: crop("Crop left"),
        cropTop: crop("Crop top"),
        cropRight: crop("Crop right"),
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

function stage(): Document {
  let document = emptyDocument("Living");
  document = run(document, "scene.create", { id: "s", name: "Live" });
  document = run(document, "layer.create", {
    id: "v",
    sceneId: "s",
    kind: "visual",
  });
  return run(document, "layer.visual", { layerId: "v", visual: "framed" });
}

describe("addresses.edit", () => {
  it("writes several Addresses as one step, labelled and coalesced by the set", () => {
    const result = executeCommand(registry, stage(), "addresses.edit", {
      edits: [
        { address: "layer/v/param/cropRight", value: 0.25 },
        { address: "layer/v/param/cropLeft", value: 0.5 },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.document.layers.v).toMatchObject({
      parameters: { cropLeft: 0.5, cropRight: 0.25, cropTop: 0 },
    });
    expect(result.label).toBe("Change Crop right and Crop left");
    expect(result.coalesceKey).toBe(
      "addresses.edit:layer/v/param/cropLeft,layer/v/param/cropRight",
    );
    const three = executeCommand(registry, stage(), "addresses.edit", {
      edits: [
        { address: "layer/v/param/cropLeft", value: 0 },
        { address: "layer/v/param/cropTop", value: 0.1 },
        { address: "layer/v/param/cropRight", value: 0 },
      ],
    });
    if (!three.ok) throw new Error(three.error);
    expect(three.label).toBe("Change Crop left, Crop top and Crop right");
    expect(three.patches).toHaveLength(1);
  });

  it("refuses them all when one is refused, and an Address named twice", () => {
    const document = stage();
    const refused = executeCommand(registry, document, "addresses.edit", {
      edits: [
        { address: "layer/v/param/cropLeft", value: 0.5 },
        { address: "layer/v/param/cropTop", value: 2 },
      ],
    });
    expect(refused).toMatchObject({
      ok: false,
      error: "Crop top must be between 0 and 1.",
    });
    const twice = executeCommand(registry, document, "addresses.edit", {
      edits: [
        { address: "layer/v/param/cropLeft", value: 0.5 },
        { address: "layer/v/param/cropLeft", value: 0.2 },
      ],
    });
    expect(twice.ok).toBe(false);
  });

  it("refuses an Address a Controller drives", () => {
    let document = stage();
    document = run(document, "controller.create", {
      id: "c",
      kind: "number",
      name: "Edge",
      addresses: ["layer/v/param/cropTop"],
    });
    const result = executeCommand(registry, document, "addresses.edit", {
      edits: [
        { address: "layer/v/param/cropLeft", value: 0.5 },
        { address: "layer/v/param/cropTop", value: 0.1 },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      error: "Crop top is controlled by Edge.",
    });
  });
});
