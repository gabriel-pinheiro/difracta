import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { planFrame } from "./plan.ts";

const solid: VisualDefinition = {
  kind: "visual",
  id: "solid",
  name: "Solid",
  description: "One color.",
  backend: "canvas",
  parameters: {},
};
const registry = createBuiltInRegistry(new Catalog({ visuals: [solid] }));

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function installation(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out_a", name: "A" });
  document = run(document, "output.create", { id: "out_b", name: "B" });
  document = run(document, "surface.create", {
    id: "sur_wall",
    name: "Wall",
    output: "out_a",
  });
  document = run(document, "surface.create", {
    id: "sur_floor",
    name: "Floor",
    output: "out_a",
  });
  document = run(document, "surface.create", {
    id: "sur_tv",
    name: "TV",
    output: "out_b",
  });
  document = run(document, "surface.create", {
    id: "sur_loose",
    name: "Loose",
    output: null,
  });
  return run(document, "mask.create", {
    id: "mask_door",
    surfaceId: "sur_wall",
    name: "Door",
  });
}

const calibration = {
  surfaceId: "sur_wall",
  maskId: null,
  corner: "topRight",
  point: null,
  view: "selected",
  owner: "s1",
};

/** A Scene, top to bottom: A on the wall, a Group of B (floor) and C (no Target), a Filter, disabled D, E on the TV. */
function staged(): Document {
  let document = run(installation(), "scene.create", { id: "s1", name: "One" });
  const add = (
    id: string,
    kind: "visual" | "filter" | "group",
    parentId: string | null = null,
  ): void => {
    document = run(document, "layer.create", {
      id,
      kind,
      sceneId: "s1",
      parentId,
    });
  };
  const place = (id: string, target: string | null): void => {
    document = run(document, "layer.visual", { layerId: id, visual: "solid" });
    document = run(document, "layer.update", { layerId: id, target });
  };
  // New Layers land on top, so create bottom first.
  add("E", "visual");
  place("E", "sur_tv");
  add("D", "visual");
  place("D", "sur_wall");
  document = run(document, "address.set", {
    address: "layer/D/enabled",
    value: false,
  });
  add("F", "filter");
  add("G", "group");
  add("C", "visual", "G");
  place("C", null);
  add("B", "visual", "G");
  place("B", "sur_floor");
  add("A", "visual");
  place("A", "sur_wall");
  return run(document, "scene.play", { sceneId: "s1" });
}

describe("planFrame", () => {
  it("draws nothing outside Calibration Mode when no Scene plays", () => {
    const plan = planFrame(installation(), "out_a");
    expect(plan).toEqual({ blackout: false, draws: [], layers: [] });
  });

  it("plans the active Scene's Layers bottom first, on this Output only", () => {
    const plan = planFrame(staged(), "out_a");
    expect(plan.draws).toEqual([]);
    expect(
      plan.layers.map((draw) => [
        draw.layer.id,
        draw.surface.id,
        draw.masks.length,
      ]),
    ).toEqual([
      ["B", "sur_floor", 0],
      ["A", "sur_wall", 1],
    ]);
    expect(planFrame(staged(), "out_b").layers.map((d) => d.layer.id)).toEqual([
      "E",
    ]);
    // A disabled Group hides its Layers.
    const groupOff = run(staged(), "address.set", {
      address: "layer/G/enabled",
      value: false,
    });
    expect(planFrame(groupOff, "out_a").layers.map((d) => d.layer.id)).toEqual([
      "A",
    ]);
  });

  it("draws nothing under Blackout", () => {
    const document = run(staged(), "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(planFrame(document, "out_a")).toEqual({
      blackout: true,
      draws: [],
      layers: [],
    });
  });

  it("shows the calibrated Surface as a pattern with its corner, others per view, and no Layers", () => {
    const selected = run(staged(), "calibration.set", calibration);
    expect(planFrame(selected, "out_a").layers).toEqual([]);
    expect(planFrame(selected, "out_b").layers).toHaveLength(1);
    expect(
      planFrame(selected, "out_a").draws.map((draw) => [
        draw.surface.id,
        draw.style,
        draw.highlighted,
        draw.corner,
        draw.masks.length,
      ]),
    ).toEqual([["sur_wall", "pattern", true, "topRight", 0]]);
    const outlines = run(selected, "calibration.set", {
      ...calibration,
      view: "outlines",
    });
    expect(
      planFrame(outlines, "out_a").draws.map((draw) => draw.style),
    ).toEqual(["pattern", "outline"]);
    const patterns = run(selected, "calibration.set", {
      ...calibration,
      view: "patterns",
    });
    expect(
      planFrame(patterns, "out_a").draws.map((draw) => [
        draw.style,
        draw.highlighted,
      ]),
    ).toEqual([
      ["pattern", true],
      ["pattern", false],
    ]);
    // The other Output is unaffected.
    expect(planFrame(patterns, "out_b").draws).toEqual([]);
  });

  it("applies and outlines the Mask being aligned", () => {
    const document = run(installation(), "calibration.set", {
      ...calibration,
      maskId: "mask_door",
      corner: null,
      point: 2,
    });
    const [wall] = planFrame(document, "out_a").draws;
    expect(wall?.masks.map((mask) => mask.id)).toEqual(["mask_door"]);
    expect(wall?.corner).toBeUndefined();
    expect(wall?.maskOutline?.mask.id).toBe("mask_door");
    expect(wall?.maskOutline?.point).toBe(2);
  });
});
