import type { Document } from "@difracta/core";
import { describe, expect, it } from "vitest";

import type { EntityKind } from "@/entities";

import { ancestorRows, groupParent, type RowParent } from "./ancestor-rows";

const document = {
  controllers: {
    outer: { parentId: null },
    inner: { parentId: "outer" },
    deep: { parentId: "inner" },
    top: { parentId: null },
    loopA: { parentId: "loopB" },
    loopB: { parentId: "loopA" },
  },
  scenes: { s1: {} },
  layers: {
    group: { sceneId: "s1", parentId: null },
    visual: { sceneId: "s1", parentId: "group" },
  },
} as unknown as Document;

const parents: Partial<Record<EntityKind, RowParent>> = {
  controller: groupParent("controller", (held) => held.controllers),
  layer: (held, id) => {
    const layer = held.layers[id];
    if (layer === undefined) return undefined;
    return layer.parentId === null
      ? { kind: "scene", id: layer.sceneId }
      : { kind: "layer", id: layer.parentId };
  },
};
const parentOf = (kind: EntityKind): RowParent | undefined => parents[kind];

describe("groupParent", () => {
  const parent = groupParent("controller", (held) => held.controllers);

  it("is the Group an entity is in, and nothing at the root or when missing", () => {
    expect(parent(document, "deep")).toEqual({
      kind: "controller",
      id: "inner",
    });
    expect(parent(document, "top")).toBeUndefined();
    expect(parent(document, "gone")).toBeUndefined();
  });
});

describe("ancestorRows", () => {
  it("walks every level, nearest first", () => {
    expect(
      ancestorRows(document, { kind: "controller", id: "deep" }, parentOf),
    ).toEqual([
      { kind: "controller", id: "inner" },
      { kind: "controller", id: "outer" },
    ]);
  });

  it("crosses kinds where a row nests under another kind", () => {
    expect(
      ancestorRows(document, { kind: "layer", id: "visual" }, parentOf),
    ).toEqual([
      { kind: "layer", id: "group" },
      { kind: "scene", id: "s1" },
    ]);
  });

  it("is empty for a root row, a missing entity and a kind that never nests", () => {
    expect(
      ancestorRows(document, { kind: "controller", id: "top" }, parentOf),
    ).toEqual([]);
    expect(
      ancestorRows(document, { kind: "controller", id: "gone" }, parentOf),
    ).toEqual([]);
    expect(
      ancestorRows(document, { kind: "scene", id: "s1" }, parentOf),
    ).toEqual([]);
  });

  it("ends a chain that loops", () => {
    expect(
      ancestorRows(document, { kind: "controller", id: "loopA" }, parentOf),
    ).toEqual([{ kind: "controller", id: "loopB" }]);
  });
});
