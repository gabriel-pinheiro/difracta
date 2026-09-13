import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  tableEntries,
  type Document,
} from "../document/document.ts";
import { runnableMacros } from "../document/macros.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** A Group holding one Layer, with a Link and Macro actions on both the Group and the Layer. */
function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["layer.create", { id: "grp", sceneId: "s", kind: "group", name: "Sky" }],
    [
      "layer.create",
      { id: "stars", sceneId: "s", parentId: "grp", kind: "visual" },
    ],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    [
      "link.create",
      {
        controllerId: "energy",
        addresses: ["layer/grp/enabled", "layer/stars/enabled"],
      },
    ],
    ["macro.create", { id: "look", name: "Look" }],
    [
      "macro.actions.add",
      {
        macroId: "look",
        actions: [
          { kind: "toggle", address: "layer/grp/enabled" },
          { kind: "set", address: "layer/stars/enabled", value: true },
          { kind: "set", address: "layer/stars/opacity", value: 0.5 },
        ],
      },
    ],
  ] as const)
    document = run(document, name, payload);
  return document;
}

const linkAddresses = (document: Document): string[] =>
  tableEntries(document.links)
    .map((link) => link.address)
    .sort();

const actionAddresses = (document: Document): string[] =>
  runnableMacros(document.macros).flatMap((macro) =>
    macro.actions.map((action) => action.address),
  );

describe("layer.ungroup", () => {
  it("drops the Links and Macro actions on the dissolved Group and keeps the contents' own", () => {
    const document = stage();
    expect(linkAddresses(document)).toEqual([
      "layer/grp/enabled",
      "layer/stars/enabled",
    ]);
    const ungrouped = run(document, "layer.ungroup", { layerId: "grp" });
    expect(ungrouped.layers.grp).toBeUndefined();
    expect(ungrouped.layers.stars?.parentId).toBeNull();
    expect(linkAddresses(ungrouped)).toEqual(["layer/stars/enabled"]);
    expect(actionAddresses(ungrouped)).toEqual([
      "layer/stars/enabled",
      "layer/stars/opacity",
    ]);
    expect(
      JSON.stringify([ungrouped.links, ungrouped.macros]).includes("grp"),
    ).toBe(false);
  });

  it("leaves Macros alone when nothing targeted the Group", () => {
    let document = stage();
    document = run(document, "layer.create", {
      id: "wrap",
      sceneId: "s",
      kind: "group",
    });
    const ungrouped = run(document, "layer.ungroup", { layerId: "wrap" });
    expect(ungrouped.macros).toBe(document.macros);
    expect(ungrouped.links).toBe(document.links);
  });
});

describe("layer.create placement", () => {
  it("lands on top unless `after` names the sibling to sit below", () => {
    let document = stage();
    for (const payload of [
      { id: "sun", sceneId: "s", kind: "visual", name: "Sun" },
      { id: "moon", sceneId: "s", kind: "visual", name: "Moon", after: "grp" },
      {
        id: "haze",
        sceneId: "s",
        parentId: "grp",
        kind: "visual",
        name: "Haze",
        after: "stars",
      },
    ] as const)
      document = run(document, "layer.create", payload);
    const order = (parentId: string | null): string[] =>
      tableEntries(document.layers)
        .filter((layer) => layer.parentId === parentId)
        .sort((first, second) => (first.order < second.order ? -1 : 1))
        .map((layer) => layer.id);
    expect(order(null)).toEqual(["sun", "grp", "moon"]);
    expect(order("grp")).toEqual(["stars", "haze"]);
    const result = executeCommand(registry, document, "layer.create", {
      sceneId: "s",
      kind: "visual",
      after: "stars",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Layer “stars” is not among the siblings.");
  });
});
