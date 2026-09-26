import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  describeController,
  describeMacro,
  formatSceneRows,
  formatSceneTree,
  formatTreeNodes,
  sceneRows,
  sceneTree,
  treeNodes,
} from "./scene-tree.ts";

/** One Visual is enough to give a Layer something to show. */
const catalog = new Catalog({
  visuals: [
    {
      id: "solid",
      kind: "visual",
      name: "Solid",
      description: "One colour.",
      backend: "canvas",
      parameters: {},
    },
    {
      id: "bolt",
      kind: "visual",
      name: "Bolt",
      description: "Follows a Path.",
      backend: "canvas",
      parameters: {},
      paths: [{ key: "route", label: "Route" }],
    },
  ],
  filters: [],
});
const registry = createBuiltInRegistry(catalog);

function stage(): Document {
  let document = emptyDocument("Living");
  const steps: readonly (readonly [string, unknown])[] = [
    ["surface.create", { id: "sur", name: "Wall", output: null }],
    ["scene.create", { id: "sc", name: "Live" }],
    ["scene.create", { id: "sc2", name: "Rehearsal" }],
    [
      "layer.create",
      { id: "wash", sceneId: "sc", kind: "visual", name: "Wash" },
    ],
    ["layer.visual", { layerId: "wash", visual: "solid" }],
    ["layer.update", { layerId: "wash", target: "sur", opacity: 0.5 }],
    ["region.create", { id: "reg", surfaceId: "sur", name: "North" }],
    [
      "layer.create",
      { id: "looks", sceneId: "sc", kind: "group", name: "Looks" },
    ],
    [
      "layer.create",
      {
        id: "blur",
        sceneId: "sc",
        kind: "filter",
        name: "Blur",
        parentId: "looks",
      },
    ],
    ["layer.update", { layerId: "blur", mix: 0.25 }],
    ["layer.update", { layerId: "looks", enabled: false }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    ["controller.create", { id: "cg", kind: "group", name: "Palette" }],
    [
      "controller.create",
      { id: "tint", kind: "color", name: "Tint", parentId: "cg" },
    ],
    [
      "link.create",
      { controllerId: "energy", addresses: ["layer/wash/opacity"] },
    ],
    ["macro.create", { id: "mg", kind: "group", name: "Hits" }],
    ["macro.create", { id: "hit", name: "Hit", parentId: "mg" }],
    [
      "macro.actions.add",
      {
        macroId: "hit",
        actions: [
          { kind: "set", address: "installation/blackout", value: true },
        ],
      },
    ],
    ["scene.play", { sceneId: "sc" }],
  ];
  for (const [name, payload] of steps) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(`${name}: ${result.error}`);
    document = result.document;
  }
  return document;
}

describe("sceneTree", () => {
  it("nests Layers top first with what each renders, gated by its Group", () => {
    const tree = sceneTree(stage(), "sc");
    expect(tree).toEqual([
      {
        id: "looks",
        name: "Looks",
        kind: "group",
        enabled: false,
        effectivelyEnabled: false,
        children: [
          {
            id: "blur",
            name: "Blur",
            kind: "filter",
            enabled: true,
            effectivelyEnabled: false,
            definition: null,
            level: { field: "mix", value: 0.25 },
            children: [],
          },
        ],
      },
      {
        id: "wash",
        name: "Wash",
        kind: "visual",
        enabled: true,
        effectivelyEnabled: true,
        definition: "solid",
        level: { field: "opacity", value: 0.5, controlledBy: "Energy" },
        target: { id: "sur", name: "Wall" },
        children: [],
      },
    ]);
  });

  it("formats one indented line per Layer", () => {
    expect(formatSceneTree(sceneTree(stage(), "sc"))).toEqual([
      "Group “Looks”  looks  off",
      "  Filter “Blur”  blur  on (Group off)  (no Filter)  mix 25%",
      "Layer “Wash”  wash  on  solid  opacity 50% ← Energy  → Wall",
    ]);
  });

  it("names a Region Target under its Surface, as the CLI accepts it back", () => {
    const result = executeCommand(registry, stage(), "layer.update", {
      layerId: "wash",
      target: "reg",
    });
    if (!result.ok) throw new Error(result.error);
    const wash = sceneTree(result.document, "sc").find((n) => n.id === "wash");
    expect(wash?.target).toEqual({ id: "reg", name: "Wall/North" });
    expect(formatSceneTree([wash!])[0]).toContain("→ Wall/North");
  });

  it("names a Path the Visual follows that is unbound or off the Target", () => {
    let document = stage();
    const steps: readonly (readonly [string, unknown])[] = [
      ["surface.create", { id: "floor", name: "Floor", output: null }],
      ["path.create", { id: "edge", surfaceId: "floor", name: "Edge" }],
      [
        "layer.create",
        { id: "zap", sceneId: "sc2", kind: "visual", name: "Zap" },
      ],
      ["layer.visual", { layerId: "zap", visual: "bolt" }],
      ["layer.update", { layerId: "zap", target: "sur" }],
    ];
    for (const [name, payload] of steps) {
      const result = executeCommand(registry, document, name, payload);
      if (!result.ok) throw new Error(`${name}: ${result.error}`);
      document = result.document;
    }
    const [zap] = sceneTree(document, "sc2", catalog);
    expect(zap?.missingPaths).toEqual([{ key: "route", reason: "unbound" }]);
    expect(formatSceneTree(sceneTree(document, "sc2", catalog))).toEqual([
      "Layer “Zap”  zap  on  bolt  opacity 100%  → Wall  Path route unbound",
    ]);
    // A binding left pointing at another Surface's Path reads as off the Target.
    const layer = document.layers.zap;
    if (layer?.kind !== "visual") throw new Error("zap is a Visual Layer");
    const stale: Document = {
      ...document,
      layers: {
        ...document.layers,
        zap: { ...layer, paths: { route: "edge" } },
      },
    };
    expect(formatSceneTree(sceneTree(stale, "sc2", catalog))).toEqual([
      "Layer “Zap”  zap  on  bolt  opacity 100%  → Wall  Path route not on the Target",
    ]);
    // Without a Catalog nothing is known about Paths.
    expect(sceneTree(document, "sc2")[0]?.missingPaths).toBeUndefined();
  });

  it("is empty for a Scene without Layers", () => {
    expect(sceneTree(stage(), "sc2")).toEqual([]);
  });
});

describe("sceneRows", () => {
  it("lists Scenes with the active one marked and their Layer counts", () => {
    const rows = sceneRows(stage());
    expect(rows).toEqual([
      { id: "sc", name: "Live", active: true, layers: 3 },
      { id: "sc2", name: "Rehearsal", active: false, layers: 0 },
    ]);
    expect(formatSceneRows(rows)).toEqual([
      "▶ Live  sc  3 Layers",
      "  Rehearsal  sc2  0 Layers",
    ]);
  });
});

describe("treeNodes", () => {
  it("groups Controllers and Macros under their Groups", () => {
    const document = stage();
    const controllers = treeNodes(document.controllers);
    // A new Controller lands at the top, so the Group made last comes first.
    expect(controllers.map((node) => node.id)).toEqual(["cg", "energy"]);
    expect(controllers[0]?.children.map((node) => node.id)).toEqual(["tint"]);
    expect(formatTreeNodes(controllers, describeController)).toEqual([
      "Group “Palette”  cg",
      "  Color “Tint”  tint  value [1, 1, 1, 1]",
      "Number “Energy”  energy  value 0%",
    ]);
    expect(formatTreeNodes(treeNodes(document.macros), describeMacro)).toEqual([
      "Group “Hits”  mg",
      "  Macro “Hit”  hit  1 action",
    ]);
  });

  it("names a Macro's Run Mode when it is not All", () => {
    const hit = stage().macros.hit;
    if (hit?.kind !== "macro") throw new Error("Expected the Hit Macro.");
    expect(describeMacro({ ...hit, mode: "one" })).toBe(
      "Macro “Hit”  hit  1 action  runs one",
    );
    expect(describeMacro({ ...hit, mode: "some", count: 3 })).toBe(
      "Macro “Hit”  hit  1 action  runs some 3",
    );
    expect(describeMacro({ ...hit, mode: "sequence" })).toBe(
      "Macro “Hit”  hit  1 action  runs in sequence",
    );
  });
});
