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
});
