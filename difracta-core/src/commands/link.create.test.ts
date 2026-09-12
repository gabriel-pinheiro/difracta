import { describe, expect, it } from "vitest";

import { listAddresses } from "../address/address.ts";
import { anchorsProblem, defaultAnchors, linkAt } from "../address/links.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
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
        mirror: { kind: "boolean", label: "Mirror", default: false },
      },
    },
  ],
  filters: [],
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function failure(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["layer.create", { id: "a", sceneId: "s", kind: "visual" }],
    ["layer.visual", { layerId: "a", visual: "blink" }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
  ] as const)
    document = run(document, name, payload);
  return document;
}

const HOLD_RANGE =
  "Hold anchors must lie within 0 to 2000 in steps of 10; the anchor at";

describe("Link anchors", () => {
  it("accepts anchors within the range and on the step, reversed or not", () => {
    const document = stage();
    const linked = run(document, "link.create", {
      controllerId: "energy",
      addresses: ["layer/a/param/hold"],
      anchors: { from: 500, to: 10 },
    });
    const link = linkAt(linked, "layer/a/param/hold");
    expect(link?.anchors).toEqual({ from: 500, to: 10 });
    const updated = run(linked, "link.update", {
      linkId: link?.id ?? "",
      anchors: { from: 0, to: 2000 },
    });
    expect(linkAt(updated, "layer/a/param/hold")?.anchors).toEqual({
      from: 0,
      to: 2000,
    });
  });

  it("refuses anchors outside the range or off the step, on create and update", () => {
    const document = stage();
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/hold"],
        anchors: { from: -10, to: 2000 },
      }),
    ).toBe(`${HOLD_RANGE} 0 must be between 0 and 2000.`);
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/hold"],
        anchors: { from: 0, to: 2005 },
      }),
    ).toBe(`${HOLD_RANGE} 1 must be between 0 and 2000.`);
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/hold"],
        anchors: { from: 0, to: 5 },
      }),
    ).toBe(`${HOLD_RANGE} 1 must be a multiple of 10 from 0 (got 5).`);
    expect(Object.keys(document.links)).toEqual([]);

    const linked = run(document, "link.create", {
      controllerId: "energy",
      addresses: ["layer/a/param/hold"],
    });
    const linkId = linkAt(linked, "layer/a/param/hold")?.id ?? "";
    expect(
      failure(linked, "link.update", {
        linkId,
        anchors: { from: 15, to: 2000 },
      }),
    ).toBe(`${HOLD_RANGE} 0 must be a multiple of 10 from 0 (got 15).`);
    expect(
      failure(linked, "link.update", {
        linkId,
        anchors: { from: 0, to: 3000 },
      }),
    ).toBe(`${HOLD_RANGE} 1 must be between 0 and 2000.`);
    expect(linkAt(linked, "layer/a/param/hold")?.anchors).toEqual({
      from: 0,
      to: 2000,
    });
  });

  it("refuses anchors on a target that is not a number", () => {
    const document = stage();
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/hold", "layer/a/param/mirror"],
        anchors: { from: 0, to: 100 },
      }),
    ).toBe("Mirror is a boolean; only a number target has anchors.");
    const linked = run(document, "link.create", {
      controllerId: "energy",
      addresses: ["layer/a/param/mirror"],
    });
    expect(linkAt(linked, "layer/a/param/mirror")?.anchors).toBeNull();
  });

  it("starts every number Link with anchors it would accept", () => {
    const document = stage();
    const numbers = listAddresses(document, catalog).filter(
      (resolved) => resolved.type === "number",
    );
    expect(numbers.length).toBeGreaterThan(1);
    for (const resolved of numbers) {
      const anchors = defaultAnchors(resolved);
      expect(anchors).not.toBeNull();
      if (anchors !== null)
        expect(anchorsProblem(resolved, anchors)).toBeUndefined();
    }
  });
});
