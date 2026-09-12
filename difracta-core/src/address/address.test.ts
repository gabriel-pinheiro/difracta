import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import {
  addressValueProblem,
  layerAddresses,
  listAddresses,
  resolveAddress,
  sameAddressValue,
  surfaceAddresses,
} from "./address.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "plasma",
      name: "Plasma",
      description: "Flowing color.",
      backend: "shader",
      parameters: {
        speed: {
          kind: "number",
          label: "Speed",
          default: 1,
          min: 0,
          max: 4,
          step: 0.1,
          unit: "x",
        },
        palette: {
          kind: "choice",
          label: "Palette",
          default: "ember",
          options: [
            { value: "ember", label: "Ember" },
            { value: "ocean", label: "Ocean" },
          ],
        },
        tint: { kind: "color", label: "Tint", default: [1, 1, 1, 1] },
        mirror: { kind: "boolean", label: "Mirror", default: false },
      },
      cues: [{ key: "flash", label: "Flash" }],
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
          max: 40,
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

function stage(): Document {
  let document = emptyDocument("Living");
  document = run(document, "scene.create", { id: "s", name: "Live" });
  document = run(document, "layer.create", {
    id: "v",
    sceneId: "s",
    kind: "visual",
  });
  document = run(document, "layer.visual", { layerId: "v", visual: "plasma" });
  document = run(document, "layer.create", {
    id: "f",
    sceneId: "s",
    kind: "filter",
  });
  document = run(document, "layer.filter", { layerId: "f", filter: "blur" });
  document = run(document, "layer.create", {
    id: "g",
    sceneId: "s",
    kind: "group",
  });
  return document;
}

describe("addresses", () => {
  it("resolves installation/blackout to the operational path", () => {
    expect(
      resolveAddress(emptyDocument("Test"), "installation/blackout"),
    ).toEqual({
      address: "installation/blackout",
      label: "Blackout",
      path: ["operational", "blackout"],
      type: "boolean",
      default: false,
    });
  });

  it("resolves a Surface's Render Scale", () => {
    const document = run(emptyDocument("Test"), "surface.create", {
      id: "s",
      name: "Wall",
    });
    expect(resolveAddress(document, "surface/s/render-scale")).toEqual({
      address: "surface/s/render-scale",
      label: "Render Scale",
      owner: "Wall",
      path: ["surfaces", "s", "renderScale"],
      type: "number",
      default: 1,
      range: { min: 0.25, max: 2, step: 0.25, unit: "×" },
    });
    expect(
      surfaceAddresses(document.surfaces.s!).map((a) => a.address),
    ).toEqual(["surface/s/render-scale"]);
    expect(listAddresses(document).map((a) => a.address)).toEqual([
      "installation/blackout",
      "surface/s/render-scale",
    ]);
  });

  it("resolves Layer settings and Parameters with their type, default and range", () => {
    const document = stage();
    expect(resolveAddress(document, "layer/v/opacity", catalog)).toEqual({
      address: "layer/v/opacity",
      label: "Opacity",
      owner: "Plasma",
      path: ["layers", "v", "opacity"],
      type: "number",
      default: 1,
      range: { min: 0, max: 1, step: 0.01, percent: true },
    });
    expect(resolveAddress(document, "layer/v/param/speed", catalog)).toEqual({
      address: "layer/v/param/speed",
      label: "Speed",
      owner: "Plasma",
      path: ["layers", "v", "parameters", "speed"],
      type: "number",
      default: 1,
      range: { min: 0, max: 4, step: 0.1, unit: "x" },
    });
    expect(
      resolveAddress(document, "layer/v/param/palette", catalog),
    ).toMatchObject({
      type: "choice",
      options: [
        { value: "ember", label: "Ember" },
        { value: "ocean", label: "Ocean" },
      ],
    });
    expect(resolveAddress(document, "layer/v/blend", catalog)).toMatchObject({
      type: "choice",
      path: ["layers", "v", "blendMode"],
      default: "normal",
    });
    expect(resolveAddress(document, "layer/g/enabled", catalog)).toMatchObject({
      type: "boolean",
      owner: "Group",
      default: true,
    });
  });

  it("rejects unknown addresses and settings the Layer's kind lacks", () => {
    const document = stage();
    expect(resolveAddress(document, "installation/nope")).toBeUndefined();
    expect(resolveAddress(document, "blackout")).toBeUndefined();
    expect(
      resolveAddress(document, "layer/f/opacity", catalog),
    ).toBeUndefined();
    expect(resolveAddress(document, "layer/g/mix", catalog)).toBeUndefined();
    expect(
      resolveAddress(document, "layer/v/param/nope", catalog),
    ).toBeUndefined();
    expect(
      resolveAddress(document, "layer/zz/enabled", catalog),
    ).toBeUndefined();
    // Without the Catalog a Parameter cannot be typed, so it is not an Address.
    expect(resolveAddress(document, "layer/v/param/speed")).toBeUndefined();
  });

  it("lists every reachable address", () => {
    expect(
      listAddresses(stage(), catalog).map((entry) => entry.address),
    ).toEqual([
      "installation/blackout",
      "scene/s/play",
      "layer/g/enabled",
      "layer/f/enabled",
      "layer/v/enabled",
      "layer/v/opacity",
      "layer/v/blend",
      "layer/f/mix",
      "layer/f/param/radius",
      "layer/v/param/speed",
      "layer/v/param/palette",
      "layer/v/param/tint",
      "layer/v/param/mirror",
      "layer/v/cue/flash",
    ]);
  });

  it("orders one Layer's addresses as the inspector shows them", () => {
    const document = stage();
    const layer = (id: string) => {
      const found = document.layers[id];
      if (found === undefined) throw new Error(id);
      return found;
    };
    expect(layerAddresses(layer("v"), catalog).map((e) => e.address)).toEqual([
      "layer/v/enabled",
      "layer/v/opacity",
      "layer/v/blend",
      "layer/v/param/speed",
      "layer/v/param/palette",
      "layer/v/param/tint",
      "layer/v/param/mirror",
      "layer/v/cue/flash",
    ]);
    expect(layerAddresses(layer("f"), catalog).map((e) => e.address)).toEqual([
      "layer/f/enabled",
      "layer/f/mix",
      "layer/f/param/radius",
    ]);
    expect(layerAddresses(layer("g"), catalog).map((e) => e.address)).toEqual([
      "layer/g/enabled",
    ]);
  });

  it("resolves a Layer's Cues as triggers of its Visual", () => {
    const document = stage();
    expect(resolveAddress(document, "layer/v/cue/flash", catalog)).toEqual({
      address: "layer/v/cue/flash",
      label: "Flash",
      owner: "Plasma",
      path: ["layers", "v", "cue", "flash"],
      type: "trigger",
    });
    expect(
      resolveAddress(document, "layer/v/cue/boom", catalog),
    ).toBeUndefined();
    expect(
      resolveAddress(document, "layer/f/cue/flash", catalog),
    ).toBeUndefined();
    expect(
      listAddresses(document, catalog)
        .filter((e) => e.type === "trigger")
        .map((e) => e.address),
    ).toEqual(["scene/s/play", "layer/v/cue/flash"]);
  });

  it("checks values against the resolved type", () => {
    const document = stage();
    const speed = resolveAddress(document, "layer/v/param/speed", catalog);
    const palette = resolveAddress(document, "layer/v/param/palette", catalog);
    const tint = resolveAddress(document, "layer/v/param/tint", catalog);
    if (!speed || !palette || !tint) throw new Error("unresolved");
    expect(addressValueProblem(speed, 2)).toBeUndefined();
    expect(addressValueProblem(speed, 5)).toBe("must be between 0 and 4");
    expect(addressValueProblem(speed, "2")).toBe("must be a number");
    expect(addressValueProblem(palette, "ocean")).toBeUndefined();
    expect(addressValueProblem(palette, "lava")).toBe(
      "must be one of ember, ocean",
    );
    expect(addressValueProblem(tint, [0, 0, 0, 1])).toBeUndefined();
    expect(addressValueProblem(tint, [0, 0, 2, 1])).toBe(
      "must be a color of four components from 0 to 1",
    );
    expect(sameAddressValue([1, 0, 0, 1], [1, 0, 0, 1])).toBe(true);
    expect(sameAddressValue([1, 0, 0, 1], [1, 0, 0, 0.5])).toBe(false);
  });
});
