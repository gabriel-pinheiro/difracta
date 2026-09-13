import { describe, expect, it } from "vitest";

import { linkAt, effectiveLayer, effectiveValue } from "../address/links.ts";
import { resolveAddress } from "../address/address.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  tableEntries,
  type Document,
  type VisualLayer,
} from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { applyPatches } from "../document/patch.ts";
import { createBuiltInRegistry } from "./index.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "blink",
      name: "Blink",
      description: "Flashes.",
      backend: "shader",
      parameters: {
        hold: {
          kind: "number",
          label: "Hold",
          default: 100,
          min: 0,
          max: 2000,
          step: 10,
          unit: "ms",
        },
        color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
        mirror: { kind: "boolean", label: "Mirror", default: false },
        side: {
          kind: "choice",
          label: "Side",
          default: "a",
          options: [{ value: "a", label: "A" }],
        },
      },
    },
    {
      kind: "visual",
      id: "solid",
      name: "Solid",
      description: "One color.",
      backend: "canvas",
      parameters: {
        color: { kind: "color", label: "Color", default: [0, 0, 0, 1] },
      },
    },
  ],
  filters: [],
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function failure(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error("Expected a rejection.");
  return result.error;
}

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["layer.create", { id: "a", sceneId: "s", kind: "visual" }],
    ["layer.visual", { layerId: "a", visual: "blink" }],
    ["layer.create", { id: "b", sceneId: "s", kind: "visual" }],
    ["layer.visual", { layerId: "b", visual: "blink" }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    ["controller.create", { id: "tint", kind: "color", name: "Tint" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const layer = (document: Document, id: string): VisualLayer =>
  document.layers[id] as VisualLayer;

describe("Controllers", () => {
  it("creates a Controller linked to Addresses in one step", () => {
    let document = stage();
    const result = run(document, "controller.create", {
      id: "hold",
      kind: "number",
      name: "A Hold",
      addresses: ["layer/a/param/hold"],
    });
    expect(result.label).toBe("Add Number Controller");
    document = result.document;
    expect(linkAt(document, "layer/a/param/hold")).toMatchObject({
      controllerId: "hold",
      anchors: { from: 0, to: 2000 },
    });
    // Starts where the target is, so linking changes nothing on the wall.
    expect(document.controllers.hold).toMatchObject({ value: 0.05 });
    expect(
      effectiveValue(
        document,
        resolveAddress(document, "layer/a/param/hold", catalog)!,
      ),
    ).toBe(100);
    expect(
      failure(document, "controller.create", {
        kind: "color",
        addresses: ["layer/a/param/hold"],
      }),
    ).toMatch(/cannot be driven/);
  });

  it("creates, groups, moves, duplicates and removes Controllers", () => {
    let document = stage();
    expect(document.controllers.energy).toMatchObject({
      kind: "number",
      value: 0,
      parentId: null,
    });
    expect(document.controllers.tint).toMatchObject({
      kind: "color",
      value: [1, 1, 1, 1],
    });
    // New Controllers land first.
    expect(orderedEntries(document.controllers).map((c) => c.id)).toEqual([
      "tint",
      "energy",
    ]);
    document = run(document, "controller.create", {
      id: "g",
      kind: "group",
      name: "Colors",
    }).document;
    document = run(document, "controller.move", {
      controllerId: "tint",
      parentId: "g",
      after: null,
    }).document;
    expect(document.controllers.tint?.parentId).toBe("g");
    expect(
      failure(document, "controller.move", {
        controllerId: "g",
        parentId: "g",
        after: null,
      }),
    ).toContain("into itself");
    const duplicated = run(document, "controller.duplicate", {
      controllerId: "g",
      id: "g2",
    }).document;
    const copies = tableEntries(duplicated.controllers).filter(
      (c) => c.parentId === "g2",
    );
    expect(copies.map((c) => c.name)).toEqual(["Tint"]);
    const ungrouped = run(document, "controller.ungroup", {
      controllerId: "g",
    }).document;
    expect(ungrouped.controllers.g).toBeUndefined();
    expect(ungrouped.controllers.tint?.parentId).toBeNull();
    const removed = run(document, "controller.remove", {
      controllerId: "g",
    }).document;
    expect(removed.controllers.tint).toBeUndefined();
    expect(removed.controllers.energy).toBeDefined();
  });

  it("writes a Controller's value through its Address", () => {
    const document = stage();
    const moved = run(document, "address.edit", {
      address: "controller/energy/value",
      value: 0.25,
    });
    expect(moved.document.controllers.energy).toMatchObject({ value: 0.25 });
    expect(moved.label).toBe("Change Value");
    expect(
      failure(document, "address.set", {
        address: "controller/energy/value",
        value: 2,
      }),
    ).toContain("between 0 and 1");
    expect(resolveAddress(document, "controller/tint/value")?.type).toBe(
      "color",
    );
    expect(
      resolveAddress(document, "controller/energy/value"),
    ).not.toHaveProperty("default");
  });
});

describe("Parameter Links", () => {
  it("links a Controller to several Addresses in one step and maps values", () => {
    let document = stage();
    const linked = run(document, "link.create", {
      controllerId: "energy",
      addresses: [
        "layer/a/param/hold",
        "layer/b/param/hold",
        "layer/a/param/mirror",
      ],
    });
    expect(linked.label).toBe("Link 3 Parameters to Energy");
    document = linked.document;
    const hold = linkAt(document, "layer/a/param/hold");
    expect(hold?.anchors).toEqual({ from: 0, to: 2000 });
    expect(linkAt(document, "layer/a/param/mirror")?.anchors).toBeNull();

    document = run(document, "address.set", {
      address: "controller/energy/value",
      value: 0.5,
    }).document;
    const resolved = resolveAddress(document, "layer/a/param/hold", catalog)!;
    expect(effectiveValue(document, resolved)).toBe(1000);
    expect(layer(document, "a").parameters.hold).toBe(100);
    expect(
      effectiveLayer(document, layer(document, "a"), catalog),
    ).toMatchObject({ parameters: { hold: 1000, mirror: true } });
    // The same document yields the same effective Layer object.
    expect(effectiveLayer(document, layer(document, "a"), catalog)).toBe(
      effectiveLayer(document, layer(document, "a"), catalog),
    );

    // Anchors map and snap to the step; reversed anchors are fine.
    document = run(document, "link.update", {
      linkId: hold!.id,
      anchors: { from: 500, to: 0 },
    }).document;
    expect(effectiveValue(document, resolved)).toBe(250);
    document = run(document, "address.set", {
      address: "controller/energy/value",
      value: 0.33,
    }).document;
    expect(effectiveValue(document, resolved)).toBe(340);
  });

  it("refuses direct writes to a linked Address and mismatched kinds", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "tint",
      addresses: ["layer/a/param/color"],
    }).document;
    expect(
      failure(document, "address.edit", {
        address: "layer/a/param/color",
        value: [1, 0, 0, 1],
      }),
    ).toBe("Color is controlled by Tint.");
    expect(
      failure(document, "link.create", {
        controllerId: "tint",
        addresses: ["layer/a/param/hold"],
      }),
    ).toContain("cannot be driven by a Color Controller");
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/side"],
      }),
    ).toContain("cannot be driven by a Number Controller");
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["installation/blackout"],
      }),
    ).toContain("cannot be driven");
  });

  it("moves an Address between Controllers and releases it with its value", () => {
    let document = stage();
    document = run(document, "controller.create", {
      id: "tint2",
      kind: "color",
      name: "Tint 2",
    }).document;
    document = run(document, "address.set", {
      address: "controller/tint2/value",
      value: [0, 0, 1, 1],
    }).document;
    document = run(document, "link.create", {
      controllerId: "tint",
      addresses: ["layer/a/param/color"],
    }).document;
    document = run(document, "link.create", {
      controllerId: "tint2",
      addresses: ["layer/a/param/color"],
    }).document;
    expect(tableEntries(document.links)).toHaveLength(1);
    expect(linkAt(document, "layer/a/param/color")?.controllerId).toBe("tint2");

    const unlinked = run(document, "link.remove", {
      linkId: linkAt(document, "layer/a/param/color")!.id,
    });
    expect(unlinked.label).toBe("Unlink Color");
    expect(layer(unlinked.document, "a").parameters.color).toEqual([
      0, 0, 1, 1,
    ]);
    expect(unlinked.document.links).toEqual({});
    expect(applyPatches(unlinked.document, unlinked.inverse)).toEqual(document);

    const removal = run(document, "controller.remove", {
      controllerId: "tint2",
    });
    const removed = removal.document;
    expect(layer(removed, "a").parameters.color).toEqual([0, 0, 1, 1]);
    expect(removed.links).toEqual({});
    expect(removal.warnings).toEqual(["Removed 1 Link"]);
  });

  it("follows Layers through duplicate, remove and Visual changes", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "tint",
      addresses: ["layer/a/param/color"],
    }).document;
    document = run(document, "link.create", {
      controllerId: "energy",
      addresses: ["layer/a/param/hold", "layer/a/opacity"],
    }).document;

    const duplicated = run(document, "layer.duplicate", {
      layerId: "a",
      id: "a2",
    }).document;
    expect(
      tableEntries(duplicated.links)
        .map((link) => link.address)
        .sort(),
    ).toEqual([
      "layer/a/opacity",
      "layer/a/param/color",
      "layer/a/param/hold",
      "layer/a2/opacity",
      "layer/a2/param/color",
      "layer/a2/param/hold",
    ]);

    const scene = run(document, "scene.duplicate", {
      sceneId: "s",
      id: "s2",
    }).document;
    expect(tableEntries(scene.links)).toHaveLength(6);

    const removal = run(document, "layer.remove", { layerId: "a" });
    const removed = removal.document;
    expect(removed.links).toEqual({});
    expect(removal.warnings).toEqual(["Removed 3 Links"]);

    // Solid keeps a color Parameter, so that Link stays; hold and opacity: opacity stays, hold goes.
    const swapped = run(document, "layer.visual", {
      layerId: "a",
      visual: "solid",
    }).document;
    expect(
      tableEntries(swapped.links)
        .map((link) => link.address)
        .sort(),
    ).toEqual(["layer/a/opacity", "layer/a/param/color"]);

    // Reset all keeps the authored value under a linked Parameter.
    const edited = run(document, "address.edit", {
      address: "layer/a/param/mirror",
      value: true,
    }).document;
    const reset = run(edited, "layer.reset", { layerId: "a" }).document;
    expect(layer(reset, "a").parameters.mirror).toBe(false);
    expect(layer(reset, "a").parameters.hold).toBe(100);
  });
});

describe("controller.create placement", () => {
  it("lands first unless `after` names the sibling to follow", () => {
    let document = emptyDocument("Living");
    for (const payload of [
      { id: "a", kind: "number", name: "A" },
      { id: "b", kind: "number", name: "B" },
      { id: "c", kind: "number", name: "C", after: "b" },
      { id: "d", kind: "number", name: "D", after: null },
    ] as const)
      document = run(document, "controller.create", payload).document;
    expect(orderedEntries(document.controllers).map((c) => c.id)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
    const result = executeCommand(registry, document, "controller.create", {
      kind: "number",
      after: "nope",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Controller “nope” is not among the siblings.");
  });
});
