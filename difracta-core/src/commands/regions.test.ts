import { describe, expect, it } from "vitest";

import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { resolveCalibration } from "../document/calibration.ts";
import {
  emptyDocument,
  REGION_MIN_SIDE,
  type Document,
  type Region,
  type VisualLayer,
} from "../document/document.ts";
import { resolveLayerPaths, surfaceChildren } from "../document/paths.ts";
import { resolveTarget, toRegionSpace } from "../document/targets.ts";
import { createBuiltInRegistry } from "./index.ts";

const bolt: VisualDefinition = {
  kind: "visual",
  id: "bolt",
  name: "Bolt",
  description: "Strikes from a Path.",
  backend: "canvas",
  parameters: {},
  paths: [{ key: "frame", label: "Frame" }],
};
const catalog = new Catalog({ visuals: [bolt] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["output.create", { id: "out", name: "Projector" }],
    ["surface.create", { id: "sur_a", name: "Wall", output: "out" }],
    ["surface.create", { id: "sur_b", name: "Floor", output: "out" }],
    ["mask.create", { id: "mask_1", surfaceId: "sur_a", name: "Door" }],
    ["region.create", { id: "reg_1", surfaceId: "sur_a", name: "North" }],
    ["path.create", { id: "path_1", surfaceId: "sur_a", name: "Frame" }],
    ["region.create", { id: "reg_2", surfaceId: "sur_a", name: "South" }],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "layer", sceneId: "scene", kind: "visual" }],
    ["layer.update", { layerId: "layer", target: "sur_a" }],
    ["layer.visual", { layerId: "layer", visual: "bolt" }],
    ["layer.path", { layerId: "layer", key: "frame", pathId: "path_1" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const region = (document: Document, id: string): Region => {
  const found = document.regions[id];
  if (found === undefined) throw new Error(`no Region ${id}`);
  return found;
};
const layer = (document: Document): VisualLayer =>
  document.layers.layer as VisualLayer;

describe("region.create", () => {
  it("is a centered rectangle after the Surface's other children, named uniquely among Regions", () => {
    const document = installation();
    expect(region(document, "reg_1").bounds).toEqual({
      topLeft: { x: 0.25, y: 0.25 },
      bottomRight: { x: 0.75, y: 0.75 },
    });
    expect(
      surfaceChildren(document, "sur_a").map((child) => child.entity.id),
    ).toEqual(["mask_1", "reg_1", "path_1", "reg_2"]);
    const again = run(document, "region.create", {
      surfaceId: "sur_a",
      name: "North",
    }).document;
    const names = Object.values(again.regions).map((entry) => entry.name);
    expect(names).toContain("North 1");
    const other = run(document, "region.create", {
      surfaceId: "sur_b",
      name: "North",
    }).document;
    expect(Object.values(other.regions).map((entry) => entry.name)).toEqual([
      "North",
      "South",
      "North",
    ]);
  });

  it("needs its Surface", () => {
    expect(
      refuse(installation(), "region.create", { surfaceId: "nope", name: "X" }),
    ).toMatch(/does not exist/);
  });
});

describe("region.corner", () => {
  it("sets and nudges a corner, clamped inside the Surface and short of the other corner", () => {
    let document = installation();
    document = run(document, "region.corner.set", {
      regionId: "reg_1",
      corner: "topLeft",
      point: { x: -0.2, y: 0.1 },
    }).document;
    expect(region(document, "reg_1").bounds.topLeft).toEqual({ x: 0, y: 0.1 });
    document = run(document, "region.corner.nudge", {
      regionId: "reg_1",
      corner: "bottomRight",
      by: { x: 0.5, y: -0.9 },
    }).document;
    expect(region(document, "reg_1").bounds.bottomRight).toEqual({
      x: 1,
      y: 0.1 + REGION_MIN_SIDE,
    });
    const same = run(document, "region.corner.set", {
      regionId: "reg_1",
      corner: "topLeft",
      point: { x: 0, y: 0.1 },
    });
    expect(same.patches).toEqual([]);
  });

  it("coalesces set and nudge of one corner under one key", () => {
    const key = (name: string, payload: unknown) =>
      registry.get(name)?.coalesceKey?.(payload as never);
    expect(key("region.corner.set", { regionId: "r", corner: "topLeft" })).toBe(
      key("region.corner.nudge", { regionId: "r", corner: "topLeft" }),
    );
    expect(
      key("region.corner.set", { regionId: "r", corner: "topLeft" }),
    ).not.toBe(
      key("region.corner.set", { regionId: "r", corner: "bottomRight" }),
    );
  });
});

describe("Targets", () => {
  it("resolves a Surface or a Region to the owning Surface and its rectangle", () => {
    const document = installation();
    expect(resolveTarget(document, "sur_a")?.rect).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    const resolved = resolveTarget(document, "reg_1");
    expect(resolved?.surface.id).toBe("sur_a");
    expect(resolved?.region?.id).toBe("reg_1");
    expect(resolved?.rect).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });
    expect(toRegionSpace(resolved!.rect, { x: 0.5, y: 0.25 })).toEqual({
      x: 0.5,
      y: 0,
    });
    expect(resolveTarget(document, "nope")).toBeUndefined();
    expect(resolveTarget(document, null)).toBeUndefined();
  });

  it("lets a Layer target a Region and keeps its Path bindings within the Surface", () => {
    let document = installation();
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "reg_1",
    }).document;
    expect(layer(document).target).toBe("reg_1");
    expect(layer(document).paths).toEqual({ frame: "path_1" });
    expect(
      Object.keys(resolveLayerPaths(document, catalog, layer(document)) ?? {}),
    ).toEqual(["frame"]);
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "reg_2",
    }).document;
    expect(layer(document).paths).toEqual({ frame: "path_1" });
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "sur_b",
    }).document;
    expect(layer(document).paths).toEqual({});
    expect(
      refuse(document, "layer.update", { layerId: "layer", target: "nope" }),
    ).toMatch(/does not exist as a Surface or a Region/);
    const created = run(document, "layer.create", {
      id: "on_region",
      sceneId: "scene",
      kind: "visual",
      target: "reg_2",
    }).document;
    expect((created.layers.on_region as VisualLayer).target).toBe("reg_2");
  });

  it("binds a Path of the owning Surface to a Layer on a Region", () => {
    let document = installation();
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "reg_1",
    }).document;
    document = run(document, "layer.path", {
      layerId: "layer",
      key: "frame",
      pathId: null,
    }).document;
    document = run(document, "layer.path", {
      layerId: "layer",
      key: "frame",
      pathId: "path_1",
    }).document;
    expect(layer(document).paths).toEqual({ frame: "path_1" });
  });
});

describe("region.remove and surface.remove", () => {
  it("removing a Region clears the Target of Layers on it", () => {
    let document = installation();
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "reg_1",
    }).document;
    document = run(document, "region.remove", { regionId: "reg_1" }).document;
    expect(document.regions.reg_1).toBeUndefined();
    expect(layer(document).target).toBeNull();
    expect(refuse(document, "region.remove", { regionId: "reg_1" })).toMatch(
      /does not exist/,
    );
  });

  it("removing a Surface removes its Regions and clears Layers on them", () => {
    let document = installation();
    document = run(document, "layer.update", {
      layerId: "layer",
      target: "reg_2",
    }).document;
    document = run(document, "surface.remove", { surfaceId: "sur_a" }).document;
    expect(Object.keys(document.regions)).toEqual([]);
    expect(layer(document).target).toBeNull();
  });
});

describe("entity.move", () => {
  it("moves a Region among its Surface's Masks and Paths", () => {
    let document = installation();
    document = run(document, "entity.move", {
      table: "regions",
      id: "reg_2",
      after: null,
    }).document;
    expect(
      surfaceChildren(document, "sur_a").map((child) => child.entity.id),
    ).toEqual(["reg_2", "mask_1", "reg_1", "path_1"]);
  });
});

describe("calibration.set", () => {
  const base = {
    surfaceId: "sur_a",
    maskId: null,
    pathId: null,
    corner: null,
    point: null,
    view: "selected",
    owner: "studio",
  } as const;

  it("aligns a Region of the Surface with one of its two corners", () => {
    const document = run(installation(), "calibration.set", {
      ...base,
      regionId: "reg_1",
      corner: "bottomRight",
    }).document;
    const resolved = resolveCalibration(document);
    expect(resolved?.region?.id).toBe("reg_1");
    expect(resolved?.calibration.corner).toBe("bottomRight");
  });

  it("refuses a Region of another Surface, a third corner, or a Region with a Mask", () => {
    const document = installation();
    expect(
      refuse(document, "calibration.set", {
        ...base,
        surfaceId: "sur_b",
        regionId: "reg_1",
      }),
    ).toMatch(/not a Region of/);
    expect(
      refuse(document, "calibration.set", {
        ...base,
        regionId: "reg_1",
        corner: "topRight",
      }),
    ).toMatch(/no topRight corner/);
    expect(
      refuse(document, "calibration.set", {
        ...base,
        regionId: "reg_1",
        maskId: "mask_1",
      }),
    ).toMatch(/one Mask, Path or Region/);
  });

  it("drops a calibration whose Region went away", () => {
    let document = run(installation(), "calibration.set", {
      ...base,
      regionId: "reg_1",
    }).document;
    document = run(document, "region.remove", { regionId: "reg_1" }).document;
    expect(resolveCalibration(document)).toBeUndefined();
  });
});
