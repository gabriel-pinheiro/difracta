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
    outputs: ["out_a"],
  });
  document = run(document, "surface.create", {
    id: "sur_floor",
    name: "Floor",
    outputs: ["out_a"],
  });
  document = run(document, "surface.create", {
    id: "sur_tv",
    name: "TV",
    outputs: ["out_b"],
  });
  document = run(document, "surface.create", {
    id: "sur_loose",
    name: "Loose",
    outputs: [],
  });
  document = run(document, "mask.create", {
    id: "mask_door",
    surfaceId: "sur_wall",
    name: "Door",
  });
  document = run(document, "output-mask.create", {
    id: "om_window",
    outputId: "out_a",
    name: "Window",
  });
  document = run(document, "output-mask.create", {
    id: "om_beam",
    outputId: "out_a",
    name: "Beam",
  });
  return run(document, "output-mask.create", {
    id: "om_tv",
    outputId: "out_b",
    name: "Glare",
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

/** The staged Scene with a Region on the wall, top-right quarter, and A moved onto it. */
function regioned(): Document {
  let document = run(staged(), "region.create", {
    id: "reg_north",
    surfaceId: "sur_wall",
    name: "North",
  });
  document = run(document, "region.corner.set", {
    regionId: "reg_north",
    corner: "topLeft",
    point: { x: 0.5, y: 0 },
  });
  document = run(document, "region.corner.set", {
    regionId: "reg_north",
    corner: "bottomRight",
    point: { x: 1, y: 0.5 },
  });
  document = run(document, "surface.corner.set", {
    surfaceId: "sur_wall",
    corner: "topRight",
    point: { x: 0.8, y: 0.2 },
  });
  return run(document, "layer.update", { layerId: "A", target: "reg_north" });
}

const filtersOf = (plan: ReturnType<typeof planFrame>) =>
  plan.filters.map((draw) => [draw.layer.id, draw.below]);

describe("planFrame", () => {
  it("draws nothing outside Calibration Mode when no Scene plays", () => {
    const plan = planFrame(installation(), "out_a", catalog);
    expect(plan).toEqual({
      blackout: false,
      draws: [],
      outputMaskOutline: undefined,
      layers: [],
      filters: [],
      outputMasks: [
        expect.objectContaining({ id: "om_window" }),
        expect.objectContaining({ id: "om_beam" }),
      ],
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

  it("lands a Layer on a Region through its Surface's mapping, Masks and size", () => {
    let document = regioned();
    document = run(document, "surface.size", {
      surfaceId: "sur_wall",
      size: { width: 4, height: 2 },
    });
    const plan = planFrame(document, "out_a", catalog);
    const a = plan.layers.find((draw) => draw.layer.id === "A");
    expect(a?.target).toBe("reg_north");
    expect(a?.surface.id).toBe("sur_wall");
    expect(a?.masks).toHaveLength(1);
    expect(a?.rect).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(a?.size).toEqual({ width: 2, height: 1 });
    // The Region's quad is the rectangle through the mapping: its top-right
    // is the wall's moved corner and its top-left sits on the wall's top
    // edge, past the midpoint as perspective foreshortens the far half.
    expect(a?.surfaceCorners.topRight).toEqual({ x: 0.8, y: 0.2 });
    expect(a?.corners.topRight).toEqual({ x: 0.8, y: 0.2 });
    expect(a?.corners.topLeft.x).toBeCloseTo(4 / 9, 6);
    expect(a?.corners.topLeft.y).toBeCloseTo(1 / 9, 6);
    expect(a?.corners.bottomRight.x).toBeCloseTo(8 / 9, 6);
    // Two frames with an unchanged document reuse the same corners object.
    const again = planFrame(document, "out_a", catalog);
    expect(again.layers.find((d) => d.layer.id === "A")?.corners).toBe(
      a?.corners,
    );
    expect(plannedSurfaces(plan).has("sur_wall")).toBe(true);
  });

  it("hands a Layer on a Region its Paths in Region Space", () => {
    let document = run(regioned(), "path.create", {
      id: "path_edge",
      surfaceId: "sur_wall",
      name: "Edge",
    });
    document = run(document, "path.point.set", {
      pathId: "path_edge",
      index: 0,
      point: { x: 0.75, y: 0.25 },
    });
    document = run(document, "layer.visual", { layerId: "A", visual: "bolt" });
    document = run(document, "layer.path", {
      layerId: "A",
      key: "frame",
      pathId: "path_edge",
    });
    const plan = planFrame(document, "out_a", catalog);
    const a = plan.layers.find((draw) => draw.layer.id === "A");
    expect(a?.paths.frame?.points[0]).toEqual({ x: 0.5, y: 0.5 });
    const again = planFrame(document, "out_a", catalog);
    expect(again.layers.find((d) => d.layer.id === "A")?.paths.frame).toBe(
      a?.paths.frame,
    );
  });

  it("drops a Layer whose Region's Surface is elsewhere or gone", () => {
    const document = regioned();
    expect(
      planFrame(document, "out_b", catalog).layers.map((d) => d.layer.id),
    ).toEqual(["E"]);
    const removed = run(document, "region.remove", { regionId: "reg_north" });
    expect(
      planFrame(removed, "out_a", catalog).layers.map((d) => d.layer.id),
    ).toEqual(["B"]);
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

  it("plans a Visual Layer's Filter Layers on its draw, bottom first, never among the root Filters", () => {
    // A holds, top first, M (mix 0), K and L; K lands above L in the stack.
    let document = staged();
    for (const id of ["L", "K", "M"]) {
      document = run(document, "layer.create", {
        id,
        kind: "filter",
        sceneId: "s1",
        parentId: "A",
      });
      document = run(document, "layer.filter", {
        layerId: id,
        filter: "glitch",
      });
    }
    document = run(document, "address.set", {
      address: "layer/M/mix",
      value: 0,
    });
    const nestedOf = (plan: ReturnType<typeof planFrame>) =>
      plan.layers.map((draw) => [
        draw.layer.id,
        draw.filters.map((nested) => nested.layer.id),
      ]);
    expect(nestedOf(planFrame(document, "out_a", catalog))).toEqual([
      ["B", []],
      ["A", ["L", "K"]],
    ]);
    // Root Filters are placed as if the nested ones were not there.
    expect(filtersOf(planFrame(document, "out_a", catalog))).toEqual([
      ["J", 1],
    ]);
    const kOff = run(document, "address.set", {
      address: "layer/K/enabled",
      value: false,
    });
    expect(nestedOf(planFrame(kOff, "out_a", catalog))).toEqual([
      ["B", []],
      ["A", ["L"]],
    ]);
    const noFilter = run(document, "layer.filter", {
      layerId: "L",
      filter: null,
    });
    expect(nestedOf(planFrame(noFilter, "out_a", catalog))).toEqual([
      ["B", []],
      ["A", ["K"]],
    ]);
    // A hidden Layer keeps its Filters planned, idle with it; an unplanned
    // Layer (no Target here) plans none.
    const faded = run(document, "address.set", {
      address: "layer/A/opacity",
      value: 0,
    });
    const fadedPlan = planFrame(faded, "out_a", catalog);
    expect(nestedOf(fadedPlan)).toEqual([
      ["B", []],
      ["A", ["L", "K"]],
    ]);
    expect(fadedPlan.layers[1]?.hidden).toBe(true);
    const untargeted = run(document, "layer.update", {
      layerId: "A",
      target: null,
    });
    expect(nestedOf(planFrame(untargeted, "out_a", catalog))).toEqual([
      ["B", []],
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

  it("plans a Surface on every Output it is enabled on, through that Output's mapping", () => {
    let document = run(staged(), "surface.assign", {
      surfaceId: "sur_wall",
      outputs: ["out_b"],
    });
    document = run(document, "surface.corner.set", {
      surfaceId: "sur_wall",
      corner: "topLeft",
      point: { x: 0.5, y: 0.5 },
      output: "out_b",
    });
    const wallOn = (outputId: string) =>
      planFrame(document, outputId, catalog).layers.find(
        (draw) => draw.surface.id === "sur_wall",
      )?.corners.topLeft;
    expect(wallOn("out_a")).toEqual({ x: 0, y: 0 });
    expect(wallOn("out_b")).toEqual({ x: 0.5, y: 0.5 });

    // Calibration Mode is on one Output; the other keeps playing the Scene.
    const calibrating = run(document, "calibration.set", {
      ...calibration,
      outputId: "out_b",
    });
    expect(planFrame(calibrating, "out_a", catalog).draws).toEqual([]);
    expect(
      planFrame(calibrating, "out_a", catalog).layers.length,
    ).toBeGreaterThan(0);
    expect(
      planFrame(calibrating, "out_b", catalog).draws.map((draw) => [
        draw.surface.id,
        draw.corners.topLeft,
      ]),
    ).toEqual([["sur_wall", { x: 0.5, y: 0.5 }]]);

    const off = run(calibrating, "surface.assign", {
      surfaceId: "sur_wall",
      outputs: ["out_b"],
      enabled: false,
    });
    expect(planFrame(off, "out_b", catalog).draws).toEqual([]);
    expect(
      planFrame(off, "out_b", catalog).layers.map((draw) => draw.surface.id),
    ).not.toContain("sur_wall");
  });

  it("draws nothing under Blackout", () => {
    const document = run(staged(), "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(planFrame(document, "out_a", catalog)).toEqual({
      blackout: true,
      draws: [],
      outputMaskOutline: undefined,
      layers: [],
      filters: [],
      outputMasks: [],
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

  it("carries the Output's masks in order, in the Scene and in Calibration Mode, not under Blackout", () => {
    const scene = run(staged(), "entity.move", {
      table: "outputMasks",
      id: "om_beam",
      after: null,
    });
    const ids = (plan: ReturnType<typeof planFrame>) =>
      plan.outputMasks.map((mask) => mask.id);
    expect(ids(planFrame(scene, "out_a", catalog))).toEqual([
      "om_beam",
      "om_window",
    ]);
    expect(ids(planFrame(scene, "out_b", catalog))).toEqual(["om_tv"]);
    const calibrating = run(scene, "calibration.set", calibration);
    expect(ids(planFrame(calibrating, "out_a", catalog))).toEqual([
      "om_beam",
      "om_window",
    ]);
    expect(
      planFrame(calibrating, "out_a", catalog).outputMaskOutline,
    ).toBeUndefined();
    const dark = run(scene, "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(ids(planFrame(dark, "out_a", catalog))).toEqual([]);
  });

  it("shows every Surface on the Output as a plain pattern when the Output itself is calibrated", () => {
    const document = run(staged(), "calibration.set", {
      ...calibration,
      surfaceId: null,
      outputId: "out_a",
      corner: null,
      view: "selected",
    });
    const plan = planFrame(document, "out_a", catalog);
    expect(plan.layers).toEqual([]);
    expect(
      plan.draws.map((draw) => [
        draw.surface.id,
        draw.style,
        draw.highlighted,
        draw.corner,
        draw.masks.length,
        draw.regions.length,
      ]),
    ).toEqual([
      ["sur_wall", "pattern", false, undefined, 0, 0],
      ["sur_floor", "pattern", false, undefined, 0, 0],
    ]);
    expect(plan.outputMaskOutline).toBeUndefined();
    expect(planFrame(document, "out_b", catalog).draws).toEqual([]);
  });

  it("outlines the Output Mask being aligned over the Output's patterns, its point clamped", () => {
    const document = run(installation(), "calibration.set", {
      ...calibration,
      surfaceId: null,
      outputId: "out_a",
      outputMaskId: "om_window",
      corner: null,
      point: 3,
    });
    const plan = planFrame(document, "out_a", catalog);
    expect(plan.draws.map((draw) => draw.style)).toEqual([
      "pattern",
      "pattern",
    ]);
    expect(plan.outputMaskOutline?.mask.id).toBe("om_window");
    expect(plan.outputMaskOutline?.point).toBe(3);
    expect(plan.outputMasks.map((mask) => mask.id)).toEqual([
      "om_window",
      "om_beam",
    ]);
    const shorter = run(document, "output-mask.point.remove", {
      outputMaskId: "om_window",
      index: 0,
    });
    expect(planFrame(shorter, "out_a", catalog).outputMaskOutline?.point).toBe(
      2,
    );
    const gone = run(document, "output-mask.remove", {
      outputMaskId: "om_window",
    });
    expect(planFrame(gone, "out_a", catalog).draws).toEqual([]);
    expect(planFrame(gone, "out_a", catalog).outputMaskOutline).toBeUndefined();
  });

  it("outlines the Surface's Regions while its quad or one of them is aligned", () => {
    const base = regioned();
    const quad = run(base, "calibration.set", calibration);
    const onQuad = planFrame(quad, "out_a", catalog).draws[0];
    expect(onQuad?.corner).toBe("topRight");
    expect(onQuad?.masks).toHaveLength(0);
    expect(
      onQuad?.regions.map((entry) => [
        entry.region.id,
        entry.highlighted,
        entry.corner,
      ]),
    ).toEqual([["reg_north", false, undefined]]);
    const region = run(base, "calibration.set", {
      ...calibration,
      regionId: "reg_north",
      corner: "bottomRight",
    });
    const onRegion = planFrame(region, "out_a", catalog).draws[0];
    expect(onRegion?.corner).toBeUndefined();
    expect(onRegion?.masks).toHaveLength(1);
    expect(
      onRegion?.regions.map((entry) => [
        entry.region.id,
        entry.highlighted,
        entry.corner,
      ]),
    ).toEqual([["reg_north", true, "bottomRight"]]);
    const mask = run(base, "calibration.set", {
      ...calibration,
      maskId: "mask_door",
      corner: null,
    });
    expect(planFrame(mask, "out_a", catalog).draws[0]?.regions).toEqual([]);
  });
});
