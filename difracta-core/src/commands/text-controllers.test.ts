import { describe, expect, it } from "vitest";

import { effectiveValue, linkAt } from "../address/links.ts";
import { resolveAddress } from "../address/address.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  tableEntries,
  type Document,
} from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "caption",
      name: "Caption",
      description: "Words.",
      backend: "shader",
      parameters: {
        title: { kind: "text", label: "Title", default: "Text" },
        body: { kind: "text", label: "Body", default: "", multiline: true },
        size: { kind: "number", label: "Size", default: 1, min: 0, max: 4 },
      },
    },
    {
      kind: "visual",
      id: "ticker",
      name: "Ticker",
      description: "Words passing.",
      backend: "shader",
      parameters: {
        title: { kind: "text", label: "Line", default: "News" },
        body: { kind: "number", label: "Body", default: 0, min: 0, max: 1 },
      },
    },
  ],
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
    ["layer.create", { id: "a", sceneId: "s", kind: "visual", name: "Sign" }],
    ["layer.visual", { layerId: "a", visual: "caption" }],
    ["controller.create", { id: "words", kind: "text", name: "Words" }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
  ] as const)
    document = run(document, name, payload);
  return document;
}

const parameters = (document: Document, layerId: string) => {
  const layer = document.layers[layerId];
  if (layer === undefined || layer.kind === "group")
    throw new Error(`No Layer ${layerId}.`);
  return layer.parameters;
};

describe("Text Controllers", () => {
  it("starts empty, or at the first target's text when created with addresses", () => {
    let document = stage();
    expect(document.controllers.words).toMatchObject({
      kind: "text",
      name: "Words",
      value: "",
    });
    document = run(document, "controller.create", {
      id: "plain",
      kind: "text",
    });
    expect(document.controllers.plain).toMatchObject({
      name: "Text Controller",
      value: "",
    });
    document = run(document, "address.edit", {
      address: "layer/a/param/body",
      value: "one\ntwo",
    });
    document = run(document, "controller.create", {
      id: "grown",
      kind: "text",
      addresses: ["layer/a/param/body", "layer/a/param/title"],
    });
    expect(document.controllers.grown).toMatchObject({ value: "one\ntwo" });
    expect(linkAt(document, "layer/a/param/body")).toMatchObject({
      controllerId: "grown",
      anchors: null,
    });
    expect(
      effectiveValue(
        document,
        resolveAddress(document, "layer/a/param/title", catalog) ?? never(),
      ),
    ).toBe("one two");
  });

  it("is refused on creation with a target it cannot drive", () => {
    const document = stage();
    expect(
      failure(document, "controller.create", {
        kind: "text",
        addresses: ["layer/a/param/size"],
      }),
    ).toBe("“Size” cannot be driven by a Text Controller.");
    expect(
      failure(document, "controller.create", {
        kind: "number",
        addresses: ["layer/a/param/title"],
      }),
    ).toBe("“Title” cannot be driven by a Number Controller.");
  });

  it("links without anchors and refuses them", () => {
    let document = stage();
    expect(
      failure(document, "link.create", {
        controllerId: "words",
        addresses: ["layer/a/param/title"],
        anchors: { from: 0, to: 1 },
      }),
    ).toBe("Title is text; only a number target has anchors.");
    expect(
      failure(document, "link.create", {
        controllerId: "energy",
        addresses: ["layer/a/param/title"],
      }),
    ).toBe("“Title” cannot be driven by a Number Controller.");
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title"],
    });
    const link = linkAt(document, "layer/a/param/title");
    expect(link?.anchors).toBeNull();
    expect(
      failure(document, "link.update", {
        linkId: link?.id ?? "",
        anchors: { from: 0, to: 1 },
      }),
    ).toBe("Title is text; only a number target has anchors.");
    expect(
      failure(document, "address.edit", {
        address: "layer/a/param/title",
        value: "Mine",
      }),
    ).toBe("Title is controlled by Words.");
  });

  it("leaves the text showing when a Link goes, flattened at a single line", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title", "layer/a/param/body"],
    });
    document = run(document, "address.set", {
      address: "controller/words/value",
      value: "one\ntwo",
    });
    document = run(document, "link.remove", {
      linkId: linkAt(document, "layer/a/param/title")?.id ?? "",
    });
    expect(parameters(document, "a").title).toBe("one two");
    expect(linkAt(document, "layer/a/param/body")).toBeDefined();
    document = run(document, "controller.remove", { controllerId: "words" });
    expect(parameters(document, "a").body).toBe("one\ntwo");
    expect(tableEntries(document.links)).toEqual([]);
    expect(document.controllers.words).toBeUndefined();
  });

  it("duplicates with its text and without its Links", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title"],
    });
    document = run(document, "address.set", {
      address: "controller/words/value",
      value: "one\ntwo",
    });
    document = run(document, "controller.duplicate", {
      controllerId: "words",
      id: "copy",
    });
    expect(document.controllers.copy).toMatchObject({
      kind: "text",
      value: "one\ntwo",
    });
    expect(tableEntries(document.links)).toHaveLength(1);
  });
});

function never(): never {
  throw new Error("The Address did not resolve.");
}
