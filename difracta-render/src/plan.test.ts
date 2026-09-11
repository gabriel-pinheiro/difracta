import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type FilterDefinition,
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
const glitch: FilterDefinition = {
  kind: "filter",
  id: "glitch",
  name: "Glitch",
  description: "Breaks the picture.",
  backend: "shader",
  parameters: {},
};
const registry = createBuiltInRegistry(
  new Catalog({ visuals: [solid], filters: [glitch] }),
);

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

/** A Scene, top to bottom: A on the wall, a Group of J (Filter), B (floor) and C (no Target), Filter F, disabled D, E on the TV. */
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
  add("J", "filter", "G");
  add("A", "visual");
  place("A", "sur_wall");
  for (const id of ["F", "J"])
    document = run(document, "layer.filter", { layerId: id, filter: "glitch" });
  return run(document, "scene.play", { sceneId: "s1" });
}

const filtersOf = (plan: ReturnType<typeof planFrame>) =>
  plan.filters.map((draw) => [draw.layer.id, draw.below]);

describe("planFrame", () => {
  it("draws nothing outside Calibration Mode when no Scene plays", () => {
    const plan = planFrame(installation(), "out_a");
    expect(plan).toEqual({
      blackout: false,
      draws: [],
      layers: [],
      filters: [],
    });
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

  it("places a Filter after the planned Layers below it on this Output, or drops it", () => {
    // On A's Output nothing planned lies under F (D is disabled, E is
    // elsewhere), while J inside the Group sits over B.
    expect(filtersOf(planFrame(staged(), "out_a"))).toEqual([["J", 1]]);
    // On the TV both F and J are over E: a Filter in a Group still
    // transforms what lies globally below the Group.
    expect(filtersOf(planFrame(staged(), "out_b"))).toEqual([
      ["F", 1],
      ["J", 1],
    ]);
    const topmost = run(
      run(staged(), "layer.create", { id: "H", kind: "filter", sceneId: "s1" }),
      "layer.filter",
      { layerId: "H", filter: "glitch" },
    );
    expect(filtersOf(planFrame(topmost, "out_a"))).toEqual([
      ["J", 1],
      ["H", 2],
    ]);
    const mixOff = run(topmost, "address.set", {
      address: "layer/H/mix",
      value: 0,
    });
    expect(filtersOf(planFrame(mixOff, "out_a"))).toEqual([["J", 1]]);
    const groupOff = run(topmost, "address.set", {
      address: "layer/G/enabled",
      value: false,
    });
    expect(filtersOf(planFrame(groupOff, "out_a"))).toEqual([["H", 1]]);
    const noFilter = run(topmost, "layer.filter", {
      layerId: "H",
      filter: null,
    });
    expect(filtersOf(planFrame(noFilter, "out_a"))).toEqual([["J", 1]]);
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
      filters: [],
    });
  });

  it("shows the calibrated Surface as a pattern with its corner, others per view, and no Layers", () => {
    const selected = run(staged(), "calibration.set", calibration);
    expect(planFrame(selected, "out_a").layers).toEqual([]);
    expect(planFrame(selected, "out_a").filters).toEqual([]);
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
