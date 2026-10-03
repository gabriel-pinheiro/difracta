import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  tableEntries,
  type Document,
} from "../document/document.ts";
import { childLayers, descendantLayers } from "../document/layers.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function refusal(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

/**
 * A Scene with a Group holding a Visual Layer ("Clip") that holds two Filter
 * Layers, "Warm" under "Mirror", a Filter Layer at the root, and a second
 * Scene; a Link and a Macro action on a nested Filter.
 */
function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["scene.create", { id: "t", name: "Idle" }],
    ["layer.create", { id: "grp", sceneId: "s", kind: "group", name: "Sky" }],
    [
      "layer.create",
      {
        id: "clip",
        sceneId: "s",
        parentId: "grp",
        kind: "visual",
        name: "Clip",
      },
    ],
    [
      "layer.create",
      {
        id: "warm",
        sceneId: "s",
        parentId: "clip",
        kind: "filter",
        name: "Warm",
      },
    ],
    [
      "layer.create",
      {
        id: "mir",
        sceneId: "s",
        parentId: "clip",
        kind: "filter",
        name: "Mirror",
      },
    ],
    [
      "layer.create",
      { id: "root", sceneId: "s", kind: "filter", name: "Root" },
    ],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    ["link.create", { controllerId: "energy", addresses: ["layer/warm/mix"] }],
    ["macro.create", { id: "look", name: "Look" }],
    [
      "macro.actions.add",
      {
        macroId: "look",
        actions: [{ kind: "set", address: "layer/warm/mix", value: 0.5 }],
      },
    ],
  ] as const)
    document = run(document, name, payload);
  return document;
}

const names = (document: Document, parentId: string | null): string[] =>
  childLayers(document.layers, "s", parentId).map((layer) => layer.name);

describe("Filter Layers inside a Visual Layer", () => {
  it("creates and moves a Filter Layer into a Visual Layer, top first", () => {
    const document = stage();
    expect(names(document, "clip")).toEqual(["Mirror", "Warm"]);
    const moved = run(document, "layer.move", {
      layerId: "root",
      sceneId: "s",
      parentId: "clip",
      after: "warm",
    });
    expect(names(moved, "clip")).toEqual(["Mirror", "Warm", "Root"]);
    expect(names(moved, null)).toEqual(["Sky"]);
    const out = run(moved, "layer.move", {
      layerId: "warm",
      sceneId: "s",
      parentId: null,
      after: null,
    });
    expect(names(out, null)).toEqual(["Warm", "Sky"]);
    expect(out.layers.warm?.parentId).toBeNull();
  });

  it("refuses a Group or a Visual Layer inside a Visual Layer, and anything inside a Filter Layer", () => {
    const document = stage();
    expect(
      refusal(document, "layer.create", {
        sceneId: "s",
        parentId: "clip",
        kind: "visual",
      }),
    ).toMatch(/Only a Filter Layer/);
    expect(
      refusal(document, "layer.create", {
        sceneId: "s",
        parentId: "clip",
        kind: "group",
      }),
    ).toMatch(/cannot hold a Group/);
    expect(
      refusal(document, "layer.move", {
        layerId: "grp",
        sceneId: "s",
        parentId: "clip",
        after: null,
      }),
    ).toMatch(/Only a Filter Layer/);
    expect(
      refusal(document, "layer.create", {
        sceneId: "s",
        parentId: "warm",
        kind: "filter",
      }),
    ).toMatch(/holds no Layers/);
  });

  it("refuses a parent in another Scene", () => {
    expect(
      refusal(stage(), "layer.create", {
        sceneId: "t",
        parentId: "clip",
        kind: "filter",
      }),
    ).toMatch(/not in Scene/);
  });

  it("refuses to group a nested Filter Layer; grouping its Visual Layer carries the Filters", () => {
    const document = stage();
    expect(refusal(document, "layer.group", { layerId: "warm" })).toMatch(
      /inside the Visual Layer/,
    );
    const grouped = run(document, "layer.group", { layerId: "clip" });
    expect(names(grouped, "clip")).toEqual(["Mirror", "Warm"]);
    expect(grouped.layers.clip?.parentId).not.toBe("grp");
  });

  it("ungrouping leaves the Filters inside their Visual Layer", () => {
    const document = run(stage(), "layer.ungroup", { layerId: "grp" });
    expect(names(document, null)).toEqual(["Root", "Clip"]);
    expect(names(document, "clip")).toEqual(["Mirror", "Warm"]);
  });

  it("lists a Visual Layer's Filters as its descendants", () => {
    const document = stage();
    expect(
      descendantLayers(document.layers, "grp").map((layer) => layer.name),
    ).toEqual(["Clip", "Mirror", "Warm"]);
    expect(
      descendantLayers(document.layers, "clip").map((layer) => layer.name),
    ).toEqual(["Mirror", "Warm"]);
    expect(descendantLayers(document.layers, "warm")).toEqual([]);
  });

  it("removes the Filters with their Visual Layer, Links and Macro actions included", () => {
    const document = run(stage(), "layer.remove", { layerId: "clip" });
    expect(Object.keys(document.layers).sort()).toEqual(["grp", "root"]);
    expect(tableEntries(document.links)).toEqual([]);
    const macro = document.macros.look;
    expect(macro?.kind === "macro" ? macro.actions : undefined).toEqual([]);
  });

  it("duplicates a Visual Layer with its Filters under fresh ids, Links copied", () => {
    const document = run(stage(), "layer.duplicate", {
      layerId: "clip",
      id: "clip2",
    });
    expect(names(document, "grp")).toEqual(["Clip", "Clip 1"]);
    const copies = childLayers(document.layers, "s", "clip2");
    expect(copies.map((layer) => layer.name)).toEqual(["Mirror", "Warm"]);
    expect(
      copies.every((layer) => layer.id !== "warm" && layer.id !== "mir"),
    ).toBe(true);
    const warmCopy = copies.find((layer) => layer.name === "Warm");
    expect(
      tableEntries(document.links)
        .map((link) => link.address)
        .sort(),
    ).toEqual([`layer/${warmCopy?.id}/mix`, "layer/warm/mix"]);
  });

  it("duplicates a Scene with nested Filters re-keyed to the copied Visual Layer", () => {
    const document = run(stage(), "scene.duplicate", { sceneId: "s", id: "u" });
    const layers = Object.values(document.layers).filter(
      (layer) => layer.sceneId === "u",
    );
    expect(layers).toHaveLength(5);
    const clip = layers.find((layer) => layer.name === "Clip");
    expect(clip).toBeDefined();
    expect(
      childLayers(document.layers, "u", clip!.id).map((layer) => layer.name),
    ).toEqual(["Mirror", "Warm"]);
  });

  it("carries the Filters along when their Visual Layer moves to another Scene", () => {
    const document = run(stage(), "layer.move", {
      layerId: "clip",
      sceneId: "t",
      parentId: null,
      after: null,
    });
    expect(document.layers.warm?.sceneId).toBe("t");
    expect(document.layers.mir?.sceneId).toBe("t");
    expect(document.layers.warm?.parentId).toBe("clip");
  });
});
