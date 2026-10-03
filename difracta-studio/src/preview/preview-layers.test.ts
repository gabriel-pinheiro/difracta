import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { planFrame } from "@difracta/render";
import { describe, expect, it } from "vitest";

import { previewFrame, previewFrames } from "./preview-document";
import { framedLayerDisabled, framedLayers } from "./preview-layers";
import type { LayerTarget, SurfaceTarget } from "./preview-target";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "solid",
      name: "Solid",
      description: "One color.",
      backend: "canvas",
      parameters: {},
    },
  ],
  filters: [
    {
      kind: "filter",
      id: "glitch",
      name: "Glitch",
      description: "Breaks the picture.",
      backend: "shader",
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

/**
 * Scene One plays, top to bottom: A on the wall holding Filters L over K,
 * Group G of Filter J, B on the floor and C without a Target, Filter F, E
 * on the TV. Scene Two, not playing, has X on the wall.
 */
function staged(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out_a", name: "A" });
  document = run(document, "output.create", { id: "out_b", name: "B" });
  for (const [id, output] of [
    ["sur_wall", "out_a"],
    ["sur_floor", "out_a"],
    ["sur_tv", "out_b"],
  ] as const)
    document = run(document, "surface.create", {
      id,
      name: id,
      outputs: [output],
    });
  for (const id of ["s1", "s2"])
    document = run(document, "scene.create", { id, name: id });
  const add = (
    id: string,
    kind: "visual" | "filter" | "group",
    { parentId = null as string | null, target = null as string | null } = {},
    sceneId = "s1",
  ): void => {
    document = run(document, "layer.create", { id, kind, sceneId, parentId });
    if (kind === "visual") {
      document = run(document, "layer.visual", {
        layerId: id,
        visual: "solid",
      });
      document = run(document, "layer.update", { layerId: id, target });
    }
    if (kind === "filter")
      document = run(document, "layer.filter", {
        layerId: id,
        filter: "glitch",
      });
  };
  // New Layers land on top, so create bottom first.
  add("X", "visual", { target: "sur_wall" }, "s2");
  add("E", "visual", { target: "sur_tv" });
  add("F", "filter");
  add("G", "group");
  add("C", "visual", { parentId: "G" });
  add("B", "visual", { parentId: "G", target: "sur_floor" });
  add("J", "filter", { parentId: "G" });
  add("A", "visual", { target: "sur_wall" });
  add("K", "filter", { parentId: "A" });
  add("L", "filter", { parentId: "A" });
  return run(document, "scene.play", { sceneId: "s1" });
}

const off = (document: Document, id: string): Document =>
  run(document, "address.set", {
    address: `layer/${id}/enabled`,
    value: false,
  });

const onFloor = (
  layerId: string,
): LayerTarget & { readonly on: SurfaceTarget } => ({
  framing: "layer",
  layerId,
  on: {
    framing: "surface",
    surfaceId: "sur_floor",
    quadOutputId: "out_a",
    sceneId: null,
  },
});
const onOutput = (layerId: string, outputId = "out_a"): LayerTarget => ({
  framing: "layer",
  layerId,
  on: { framing: "output", outputId, sceneId: null },
});

/** The Layers and Filters the compositor would draw for the target, bottom first. */
function drawn(document: Document, target: LayerTarget) {
  const frame = previewFrame(document, target);
  const plan = planFrame(frame.document, frame.outputId, catalog);
  return {
    layers: plan.layers.map((draw) => draw.layer.id),
    filters: plan.filters.map((draw) => draw.layer.id),
  };
}

/** The Filters inside each drawn Layer, bottom first, by the Layer's id. */
function nested(document: Document, target: LayerTarget) {
  const frame = previewFrame(document, target);
  const plan = planFrame(frame.document, frame.outputId, catalog);
  return Object.fromEntries(
    plan.layers.map((draw) => [
      draw.layer.id,
      draw.filters.map((filter) => filter.layer.id),
    ]),
  );
}

describe("previewFrame of a Layer", () => {
  it("draws a Visual Layer alone, out of its Group and under no Filter", () => {
    expect(drawn(staged(), onFloor("B"))).toEqual({
      layers: ["B"],
      filters: [],
    });
    expect(drawn(off(staged(), "G"), onFloor("B")).layers).toEqual(["B"]);
  });

  it("draws nothing of a disabled Visual Layer, and says so", () => {
    const document = off(staged(), "B");
    expect(drawn(document, onFloor("B")).layers).toEqual([]);
    expect(framedLayerDisabled(document.layers, "B")).toBe(true);
    expect(framedLayerDisabled(off(staged(), "G").layers, "B")).toBe(false);
  });

  it("draws a Visual Layer with the Filters inside it, under no root Filter", () => {
    expect(drawn(staged(), onOutput("A"))).toEqual({
      layers: ["A"],
      filters: [],
    });
    expect(nested(staged(), onOutput("A"))).toEqual({ A: ["K", "L"] });
  });

  it("draws a Filter inside a Visual Layer as that Layer with its Filters up to it", () => {
    expect(drawn(staged(), onOutput("K"))).toEqual({
      layers: ["A"],
      filters: [],
    });
    expect(nested(staged(), onOutput("K"))).toEqual({ A: ["K"] });
    expect(nested(staged(), onOutput("L"))).toEqual({ A: ["K", "L"] });
  });

  it("says a Filter inside a Visual Layer is disabled when it or the Layer is", () => {
    expect(framedLayerDisabled(off(staged(), "K").layers, "K")).toBe(true);
    expect(framedLayerDisabled(off(staged(), "A").layers, "K")).toBe(true);
    expect(framedLayerDisabled(staged().layers, "K")).toBe(false);
    expect(nested(off(staged(), "A"), onOutput("K"))).toEqual({});
  });

  it("keeps a Visual Layer's Filters when a root Filter's stack includes it", () => {
    expect(nested(staged(), onOutput("F", "out_b"))).toEqual({ E: [] });
    const document = run(staged(), "layer.move", {
      layerId: "F",
      sceneId: "s1",
      parentId: null,
      after: null,
    });
    expect(nested(document, onOutput("F"))).toEqual({ B: [], A: ["K", "L"] });
  });

  it("draws a Filter Layer's stack up to and including it", () => {
    expect(drawn(staged(), onOutput("J"))).toEqual({
      layers: ["B"],
      filters: ["J"],
    });
    expect(drawn(staged(), onOutput("F", "out_b"))).toEqual({
      layers: ["E"],
      filters: ["F"],
    });
  });

  it("keeps a Filter Layer in its Groups, which still gate it", () => {
    const document = off(staged(), "G");
    expect(drawn(document, onOutput("J"))).toEqual({ layers: [], filters: [] });
    expect(framedLayerDisabled(document.layers, "J")).toBe(true);
  });

  it("draws a Group's contents alone, out of its own Groups", () => {
    expect(drawn(staged(), onOutput("G"))).toEqual({
      layers: ["B"],
      filters: ["J"],
    });
    expect(drawn(off(staged(), "G"), onOutput("G")).layers).toEqual([]);
  });

  it("draws a Layer of a Scene that is not playing", () => {
    const target = onOutput("X");
    expect(
      drawn(staged(), { ...target, on: { ...target.on, sceneId: "s2" } }),
    ).toEqual({ layers: ["X"], filters: [] });
  });

  it("is drawn on the flat Surface of the frame it is on", () => {
    const document = staged();
    const surface = previewFrame(document, onFloor("B").on);
    const layer = previewFrame(document, onFloor("B"));
    expect(layer.outputId).toBe(surface.outputId);
    expect(layer.document.surfaces.sur_floor).toBe(
      surface.document.surfaces.sur_floor,
    );
  });
});

describe("framedLayers", () => {
  it("keeps ids, and each Layer the Preview does not move", () => {
    const document = staged();
    const kept = framedLayers(document.layers, "J");
    expect(Object.keys(kept).sort()).toEqual(["B", "C", "E", "F", "G", "J"]);
    expect(Object.keys(framedLayers(document.layers, "K")).sort()).toEqual([
      "A",
      "K",
    ]);
    expect(framedLayers(document.layers, "K").K).toBe(document.layers.K);
    for (const layer of Object.values(kept))
      expect(layer).toBe(document.layers[layer.id]);
  });

  it("answers the same while the Layers are, and the same Layer copy after", () => {
    const document = staged();
    const first = framedLayers(document.layers, "B");
    expect(framedLayers(document.layers, "B")).toBe(first);
    const later = framedLayers({ ...document.layers }, "B");
    expect(later).not.toBe(first);
    expect(later.B).toBe(first.B);
    expect(first.B?.parentId).toBeNull();
  });

  it("is the Layers themselves for a Layer that is gone", () => {
    const { layers } = staged();
    expect(framedLayers(layers, "gone")).toBe(layers);
  });
});

describe("previewFrames of a Layer", () => {
  it("tells Layers apart, and not the Output a shape is read from", () => {
    const frames = previewFrames();
    const document = staged();
    const first = frames(document, onFloor("B"));
    expect(frames(document, onFloor("B"))).toBe(first);
    const quad = onFloor("B");
    expect(
      frames(document, { ...quad, on: { ...quad.on, quadOutputId: null } }),
    ).toBe(first);
    expect(frames(document, onFloor("C"))).not.toBe(first);
    expect(frames(document, onFloor("B").on)).not.toBe(
      frames(document, onFloor("B")),
    );
  });
});
