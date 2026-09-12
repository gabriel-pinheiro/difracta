import { describe, expect, it } from "vitest";

import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { resolveCalibration } from "../document/calibration.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import {
  resolveLayerPaths,
  surfaceChildren,
  unboundPaths,
} from "../document/paths.ts";
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
const plain: VisualDefinition = {
  kind: "visual",
  id: "plain",
  name: "Plain",
  description: "Needs nothing.",
  backend: "canvas",
  parameters: {},
};
const catalog = new Catalog({ visuals: [bolt, plain] });
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
    ["path.create", { id: "path_1", surfaceId: "sur_a", name: "Frame" }],
    ["mask.create", { id: "mask_2", surfaceId: "sur_a", name: "Window" }],
    ["path.create", { id: "path_b", surfaceId: "sur_b", name: "Edge" }],
    ["scene.create", { id: "scene", name: "Live" }],
    ["layer.create", { id: "layer", sceneId: "scene", kind: "visual" }],
    ["layer.update", { layerId: "layer", target: "sur_a" }],
    ["layer.visual", { layerId: "layer", visual: "bolt" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

describe("Paths", () => {
  it("creates a closed inset rectangle after the Surface's Masks and Paths", () => {
    const document = installation();
    const path = document.paths.path_1;
    expect(path).toMatchObject({
      name: "Frame",
      surfaceId: "sur_a",
      closed: true,
    });
    expect(path?.points).toEqual([
      { x: 0.15, y: 0.15 },
      { x: 0.85, y: 0.15 },
      { x: 0.85, y: 0.85 },
      { x: 0.15, y: 0.85 },
    ]);
    expect(
      surfaceChildren(document, "sur_a").map((child) => child.entity.id),
    ).toEqual(["mask_1", "path_1", "mask_2"]);
    expect(
      refuse(document, "path.create", { surfaceId: "nope", name: "x" }),
    ).toContain("does not exist");
    const numbered = run(document, "path.create", {
      surfaceId: "sur_a",
      name: "frame",
    }).document;
    expect(
      Object.values(numbered.paths)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Edge", "Frame", "frame 1"]);
  });

  it("moves Masks and Paths through one shared order per Surface", () => {
    let document = installation();
    document = run(document, "entity.move", {
      table: "paths",
      id: "path_1",
      after: "mask_2",
    }).document;
    expect(
      surfaceChildren(document, "sur_a").map((child) => child.entity.id),
    ).toEqual(["mask_1", "mask_2", "path_1"]);
    document = run(document, "entity.move", {
      table: "masks",
      id: "mask_2",
      after: null,
    }).document;
    expect(
      surfaceChildren(document, "sur_a").map((child) => child.entity.id),
    ).toEqual(["mask_2", "mask_1", "path_1"]);
    expect(
      refuse(document, "entity.move", {
        table: "paths",
        id: "path_1",
        after: "path_b",
      }),
    ).toContain("not a sibling");
  });

  it("renames, opens and edits points, extending an open Path past its end", () => {
    let document = installation();
    document = run(document, "path.rename", {
      pathId: "path_1",
      name: "Frame",
    }).document;
    const opened = run(document, "path.update", {
      pathId: "path_1",
      closed: false,
    });
    expect(opened.label).toBe("Open Path");
    document = opened.document;
    expect(document.paths.path_1?.closed).toBe(false);
    document = run(document, "path.point.set", {
      pathId: "path_1",
      index: 0,
      point: { x: 0.1, y: 0.2 },
    }).document;
    document = run(document, "path.point.nudge", {
      pathId: "path_1",
      index: 0,
      by: { x: 0.05, y: 0 },
    }).document;
    expect(document.paths.path_1?.points[0]).toEqual({ x: 0.15, y: 0.2 });
    // After the last point of an open Path, the line continues.
    document = run(document, "path.point.add", {
      pathId: "path_1",
      after: 3,
    }).document;
    expect(document.paths.path_1?.points).toHaveLength(5);
    expect(document.paths.path_1?.points[4]).toEqual({ x: 0, y: 0.85 });
    // Between two points it lands halfway.
    document = run(document, "path.point.add", {
      pathId: "path_1",
      after: 1,
    }).document;
    expect(document.paths.path_1?.points[2]).toEqual({ x: 0.85, y: 0.5 });
    for (let count = 6; count > 2; count -= 1)
      document = run(document, "path.point.remove", {
        pathId: "path_1",
        index: 0,
      }).document;
    expect(
      refuse(document, "path.point.remove", { pathId: "path_1", index: 0 }),
    ).toContain("at least 2");
    expect(
      refuse(document, "path.point.set", {
        pathId: "path_1",
        index: 9,
        point: { x: 0, y: 0 },
      }),
    ).toContain("does not exist");
  });

  it("binds Paths on the Target only, under keys the Visual declares", () => {
    let document = installation();
    expect(unboundPaths(document, catalog, layerOf(document))).toEqual([
      "frame",
    ]);
    expect(resolveLayerPaths(document, catalog, layerOf(document))).toBe(
      undefined,
    );
    expect(
      refuse(document, "layer.path", {
        layerId: "layer",
        key: "origin",
        pathId: "path_1",
      }),
    ).toContain("declares no Path");
    expect(
      refuse(document, "layer.path", {
        layerId: "layer",
        key: "frame",
        pathId: "path_b",
      }),
    ).toContain("not on the Layer's Target");
    const bound = run(document, "layer.path", {
      layerId: "layer",
      key: "frame",
      pathId: "path_1",
    });
    expect(bound.label).toBe("Bind Path");
    document = bound.document;
    expect(layerOf(document).paths).toEqual({ frame: "path_1" });
    expect(unboundPaths(document, catalog, layerOf(document))).toEqual([]);
    expect(
      resolveLayerPaths(document, catalog, layerOf(document))?.frame?.id,
    ).toBe("path_1");
    expect(
      run(document, "layer.path", {
        layerId: "layer",
        key: "frame",
        pathId: "path_1",
      }).patches,
    ).toEqual([]);
    document = run(document, "layer.path", {
      layerId: "layer",
      key: "frame",
      pathId: null,
    }).document;
    expect(layerOf(document).paths).toEqual({});
  });

  it("drops bindings that no longer fit when the Visual or Target changes", () => {
    let document = installation();
    document = run(document, "layer.path", {
      layerId: "layer",
      key: "frame",
      pathId: "path_1",
    }).document;
    const plainLayer = run(document, "layer.visual", {
      layerId: "layer",
      visual: "plain",
    }).document;
    expect(layerOf(plainLayer).paths).toEqual({});
    const moved = run(document, "layer.update", {
      layerId: "layer",
      target: "sur_b",
    }).document;
    expect(layerOf(moved).paths).toEqual({});
    expect(unboundPaths(moved, catalog, layerOf(moved))).toEqual(["frame"]);
    // The same Target keeps the binding.
    const same = run(document, "layer.update", {
      layerId: "layer",
      target: "sur_a",
    });
    expect(same.patches).toEqual([]);
    const gone = run(document, "path.remove", { pathId: "path_1" }).document;
    expect(gone.paths.path_1).toBeUndefined();
    expect(layerOf(gone).paths).toEqual({});
    const noSurface = run(document, "surface.remove", {
      surfaceId: "sur_a",
    }).document;
    expect(Object.keys(noSurface.paths)).toEqual(["path_b"]);
    expect(layerOf(noSurface)).toMatchObject({ target: null, paths: {} });
  });

  it("calibrates a Path of the Surface with its points", () => {
    const document = installation();
    const base = {
      surfaceId: "sur_a",
      maskId: null,
      pathId: "path_1",
      corner: null,
      point: 3,
      view: "selected",
      owner: "s1",
    };
    const calibrated = run(document, "calibration.set", base).document;
    expect(resolveCalibration(calibrated)?.path?.id).toBe("path_1");
    // A point removed since is clamped rather than dangling.
    const shorter = run(calibrated, "path.point.remove", {
      pathId: "path_1",
      index: 3,
    }).document;
    expect(resolveCalibration(shorter)?.point).toBe(2);
    expect(
      refuse(document, "calibration.set", { ...base, point: 9 }),
    ).toContain("has no point 9");
    expect(
      refuse(document, "calibration.set", { ...base, maskId: "mask_1" }),
    ).toContain("not both");
    expect(
      refuse(document, "calibration.set", { ...base, pathId: "path_b" }),
    ).toContain("not a Path of");
  });
});

function layerOf(document: Document) {
  const layer = document.layers.layer;
  if (layer?.kind !== "visual") throw new Error("Visual Layer expected.");
  return layer;
}
