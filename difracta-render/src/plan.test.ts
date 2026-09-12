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

import { planFrame, plannedSurfaces } from "./plan.ts";

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
const bolt: VisualDefinition = {
  kind: "visual",
  id: "bolt",
  name: "Bolt",
  description: "Strikes from a Path.",
  backend: "canvas",
  parameters: {},
  paths: [{ key: "frame", label: "Frame" }],
};
const catalog = new Catalog({ visuals: [solid, bolt], filters: [glitch] });
const registry = createBuiltInRegistry(catalog);

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
  pathId: null,
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
    const plan = planFrame(installation(), "out_a", catalog);
    expect(plan).toEqual({
      blackout: false,
      draws: [],
      layers: [],
      filters: [],
    });
  });

  it("plans the active Scene's Layers bottom first, on this Output only", () => {
    const plan = planFrame(staged(), "out_a", catalog);
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
    expect(
      planFrame(staged(), "out_b", catalog).layers.map((d) => d.layer.id),
    ).toEqual(["E"]);
    // A disabled Group hides its Layers.
    const groupOff = run(staged(), "address.set", {
      address: "layer/G/enabled",
      value: false,
    });
    expect(
      planFrame(groupOff, "out_a", catalog).layers.map((d) => d.layer.id),
    ).toEqual(["A"]);
  });

  it("places a Filter after the planned Layers below it on this Output, or drops it", () => {
    // On A's Output nothing planned lies under F (D is disabled, E is
    // elsewhere), while J inside the Group sits over B.
    expect(filtersOf(planFrame(staged(), "out_a", catalog))).toEqual([
      ["J", 1],
    ]);
    // On the TV both F and J are over E: a Filter in a Group still
    // transforms what lies globally below the Group.
    expect(filtersOf(planFrame(staged(), "out_b", catalog))).toEqual([
      ["F", 1],
      ["J", 1],
    ]);
    const topmost = run(
      run(staged(), "layer.create", { id: "H", kind: "filter", sceneId: "s1" }),
      "layer.filter",
      { layerId: "H", filter: "glitch" },
    );
    expect(filtersOf(planFrame(topmost, "out_a", catalog))).toEqual([
      ["J", 1],
      ["H", 2],
    ]);
    const mixOff = run(topmost, "address.set", {
      address: "layer/H/mix",
      value: 0,
    });
    expect(filtersOf(planFrame(mixOff, "out_a", catalog))).toEqual([["J", 1]]);
    const groupOff = run(topmost, "address.set", {
      address: "layer/G/enabled",
      value: false,
    });
    expect(filtersOf(planFrame(groupOff, "out_a", catalog))).toEqual([
      ["H", 1],
    ]);
    const noFilter = run(topmost, "layer.filter", {
      layerId: "H",
      filter: null,
    });
    expect(filtersOf(planFrame(noFilter, "out_a", catalog))).toEqual([
      ["J", 1],
    ]);
  });

  it("plans a Layer at opacity zero as hidden, which gives no Filter its input", () => {
    const topmost = run(
      run(staged(), "layer.create", { id: "H", kind: "filter", sceneId: "s1" }),
      "layer.filter",
      { layerId: "H", filter: "glitch" },
    );
    const fade = (document: Document, layerId: string): Document =>
      run(document, "address.set", {
        address: `layer/${layerId}/opacity`,
        value: 0,
      });
    const hiddenOf = (plan: ReturnType<typeof planFrame>) =>
      plan.layers.map((draw) => [draw.layer.id, draw.hidden]);
    expect(hiddenOf(planFrame(topmost, "out_a", catalog))).toEqual([
      ["B", false],
      ["A", false],
    ]);
    // A hidden Layer keeps its place: H still sits over both, by position.
    const aFaded = fade(topmost, "A");
    expect(hiddenOf(planFrame(aFaded, "out_a", catalog))).toEqual([
      ["B", false],
      ["A", true],
    ]);
    expect(filtersOf(planFrame(aFaded, "out_a", catalog))).toEqual([
      ["J", 1],
      ["H", 2],
    ]);
    // With only hidden Layers under them, the Filters are not planned.
    const bothFaded = fade(aFaded, "B");
    expect(hiddenOf(planFrame(bothFaded, "out_a", catalog))).toEqual([
      ["B", true],
      ["A", true],
    ]);
    expect(filtersOf(planFrame(bothFaded, "out_a", catalog))).toEqual([]);
    // Hidden or not, a planned Layer keeps its Surface's resources.
    expect([
      ...plannedSurfaces(planFrame(bothFaded, "out_a", catalog)),
    ]).toEqual(["sur_floor", "sur_wall"]);
  });

  it("lists the Surfaces of planned Layers and calibration drawings", () => {
    expect([
      ...plannedSurfaces(planFrame(installation(), "out_a", catalog)),
    ]).toEqual([]);
    const selected = run(staged(), "calibration.set", {
      ...calibration,
      view: "patterns",
    });
    expect([...plannedSurfaces(planFrame(selected, "out_a", catalog))]).toEqual(
      ["sur_wall", "sur_floor"],
    );
  });

  it("draws nothing under Blackout", () => {
    const document = run(staged(), "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(planFrame(document, "out_a", catalog)).toEqual({
      blackout: true,
      draws: [],
      layers: [],
      filters: [],
    });
  });

  it("shows the calibrated Surface as a pattern with its corner, others per view, and no Layers", () => {
    const selected = run(staged(), "calibration.set", calibration);
    expect(planFrame(selected, "out_a", catalog).layers).toEqual([]);
    expect(planFrame(selected, "out_a", catalog).filters).toEqual([]);
    expect(planFrame(selected, "out_b", catalog).layers).toHaveLength(1);
    expect(
      planFrame(selected, "out_a", catalog).draws.map((draw) => [
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
      planFrame(outlines, "out_a", catalog).draws.map((draw) => draw.style),
    ).toEqual(["pattern", "outline"]);
    const patterns = run(selected, "calibration.set", {
      ...calibration,
      view: "patterns",
    });
    expect(
      planFrame(patterns, "out_a", catalog).draws.map((draw) => [
        draw.style,
        draw.highlighted,
      ]),
    ).toEqual([
      ["pattern", true],
      ["pattern", false],
    ]);
    // The other Output is unaffected.
    expect(planFrame(patterns, "out_b", catalog).draws).toEqual([]);
  });

  it("plans a Path Visual only once every Path it declares is bound", () => {
    let document = run(staged(), "layer.visual", {
      layerId: "A",
      visual: "bolt",
    });
    const planned = (): readonly string[] =>
      planFrame(document, "out_a", catalog).layers.map((d) => d.layer.id);
    expect(planned()).toEqual(["B"]);
    document = run(document, "path.create", {
      id: "path_rim",
      surfaceId: "sur_wall",
      name: "Rim",
    });
    document = run(document, "layer.path", {
      layerId: "A",
      key: "frame",
      pathId: "path_rim",
    });
    expect(planned()).toEqual(["B", "A"]);
    const [, a] = planFrame(document, "out_a", catalog).layers;
    expect(a?.paths.frame?.id).toBe("path_rim");
    document = run(document, "path.remove", { pathId: "path_rim" });
    expect(planned()).toEqual(["B"]);
  });

  it("applies and outlines the Path being aligned", () => {
    let document = run(installation(), "path.create", {
      id: "path_rim",
      surfaceId: "sur_wall",
      name: "Rim",
    });
    document = run(document, "path.update", {
      pathId: "path_rim",
      closed: false,
    });
    document = run(document, "calibration.set", {
      ...calibration,
      pathId: "path_rim",
      corner: null,
      point: 1,
    });
    const [wall] = planFrame(document, "out_a", catalog).draws;
    expect(wall?.masks.map((mask) => mask.id)).toEqual(["mask_door"]);
    expect(wall?.corner).toBeUndefined();
    expect(wall?.maskOutline).toBeUndefined();
    expect(wall?.pathOutline?.path.closed).toBe(false);
    expect(wall?.pathOutline?.point).toBe(1);
  });

  it("applies and outlines the Mask being aligned", () => {
    const document = run(installation(), "calibration.set", {
      ...calibration,
      maskId: "mask_door",
      corner: null,
      point: 2,
    });
    const [wall] = planFrame(document, "out_a", catalog).draws;
    expect(wall?.masks.map((mask) => mask.id)).toEqual(["mask_door"]);
    expect(wall?.corner).toBeUndefined();
    expect(wall?.maskOutline?.mask.id).toBe("mask_door");
    expect(wall?.maskOutline?.point).toBe(2);
  });
});
