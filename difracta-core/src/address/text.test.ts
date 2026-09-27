import { describe, expect, it } from "vitest";

import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import {
  emptyDocument,
  type Controller,
  type Document,
  type Link,
} from "../document/document.ts";
import { settings } from "../settings.ts";
import {
  addressValueProblem,
  controllerAddress,
  linkable,
  listAddresses,
  resolveAddress,
  type ResolvedAddress,
} from "./address.ts";
import {
  effectiveDocument,
  effectiveLayer,
  effectiveValue,
  linkProblem,
  mappedValue,
} from "./links.ts";

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
        fill: { kind: "color", label: "Fill", default: [1, 1, 1, 1] },
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

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["layer.create", { id: "a", sceneId: "s", kind: "visual", name: "Sign" }],
    ["layer.visual", { layerId: "a", visual: "caption" }],
    ["controller.create", { id: "words", kind: "text", name: "Words" }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    ["controller.create", { id: "tint", kind: "color", name: "Tint" }],
  ] as const)
    document = run(document, name, payload);
  return document;
}

function resolved(document: Document, address: string): ResolvedAddress {
  const entry = resolveAddress(document, address, catalog);
  if (entry === undefined) throw new Error(`${address} did not resolve.`);
  return entry;
}

function controller(document: Document, id: string): Controller {
  const entry = document.controllers[id];
  if (entry === undefined) throw new Error(`No Controller ${id}.`);
  return entry;
}

const link = { anchors: null } as Link;

describe("text Addresses", () => {
  it("resolves a text Parameter with its default, multiline only when declared", () => {
    const document = stage();
    expect(resolved(document, "layer/a/param/title")).toEqual({
      address: "layer/a/param/title",
      label: "Title",
      owner: "Sign",
      path: ["layers", "a", "parameters", "title"],
      type: "text",
      default: "Text",
    });
    expect(resolved(document, "layer/a/param/body")).toMatchObject({
      type: "text",
      default: "",
      multiline: true,
    });
    expect(
      listAddresses(document, catalog)
        .filter((entry) => entry.type === "text")
        .map((entry) => entry.address),
    ).toEqual([
      "controller/words/value",
      "layer/a/param/title",
      "layer/a/param/body",
    ]);
  });

  it("resolves a Text Controller's value as multiline text", () => {
    const document = stage();
    const value = {
      address: "controller/words/value",
      label: "Value",
      owner: "Words",
      path: ["controllers", "words", "value"],
      type: "text",
      multiline: true,
    };
    expect(resolved(document, "controller/words/value")).toEqual(value);
    expect(controllerAddress(controller(document, "words"))).toEqual(value);
  });

  it("says why a value is not text the Address takes", () => {
    const document = stage();
    const title = resolved(document, "layer/a/param/title");
    const body = resolved(document, "layer/a/param/body");
    expect(addressValueProblem(title, "")).toBeUndefined();
    expect(addressValueProblem(title, "Olá")).toBeUndefined();
    expect(addressValueProblem(body, "one\ntwo")).toBeUndefined();
    expect(addressValueProblem(title, "one\ntwo")).toBe(
      "must be a single line",
    );
    expect(addressValueProblem(title, 3)).toBe("must be a string of text");
    expect(addressValueProblem(body, [1, 1, 1, 1])).toBe(
      "must be a string of text",
    );
    expect(
      addressValueProblem(body, "a".repeat(settings.text.maxLength + 1)),
    ).toBe(
      `must be at most ${String(settings.text.maxLength)} characters (got ${String(settings.text.maxLength + 1)})`,
    );
  });
});

describe("Text Controller links", () => {
  it("drives text on a Layer and nothing else", () => {
    const document = stage();
    const title = resolved(document, "layer/a/param/title");
    expect(linkable(title, "text")).toBe(true);
    expect(linkable(title, "number")).toBe(false);
    expect(linkable(title, "color")).toBe(false);
    expect(linkable(resolved(document, "layer/a/param/size"), "text")).toBe(
      false,
    );
    expect(linkable(resolved(document, "layer/a/param/fill"), "text")).toBe(
      false,
    );
    expect(linkable(resolved(document, "layer/a/enabled"), "text")).toBe(false);
    // Another Controller's value is text, but not a Layer's.
    expect(linkable(resolved(document, "controller/words/value"), "text")).toBe(
      false,
    );
  });

  it("names the Controller that cannot drive a target", () => {
    const document = stage();
    const words = controller(document, "words");
    const title = resolved(document, "layer/a/param/title");
    expect(linkProblem(words, title)).toBeUndefined();
    expect(linkProblem(words, resolved(document, "layer/a/param/size"))).toBe(
      "“Size” cannot be driven by a Text Controller.",
    );
    expect(linkProblem(words, resolved(document, "layer/a/param/fill"))).toBe(
      "“Fill” cannot be driven by a Text Controller.",
    );
    expect(linkProblem(controller(document, "energy"), title)).toBe(
      "“Title” cannot be driven by a Number Controller.",
    );
    expect(linkProblem(controller(document, "tint"), title)).toBe(
      "“Title” cannot be driven by a Color Controller.",
    );
  });

  it("copies the text, line breaks becoming single spaces at a single-line target", () => {
    let document = stage();
    document = run(document, "address.set", {
      address: "controller/words/value",
      value: "one \r\n\n  two\nthree",
    });
    const words = controller(document, "words");
    const title = resolved(document, "layer/a/param/title");
    const body = resolved(document, "layer/a/param/body");
    expect(mappedValue(words, link, body)).toBe("one \r\n\n  two\nthree");
    expect(mappedValue(words, link, title)).toBe("one two three");
    expect(
      mappedValue(words, link, resolved(document, "layer/a/param/size")),
    ).toBeUndefined();
    expect(mappedValue(controller(document, "energy"), link, title)).toBe(
      undefined,
    );
    expect(mappedValue(controller(document, "tint"), link, title)).toBe(
      undefined,
    );
  });

  it("shows the Controller's text as the effective value, the authored one kept", () => {
    let document = stage();
    document = run(document, "address.edit", {
      address: "layer/a/param/title",
      value: "Authored",
    });
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title", "layer/a/param/body"],
    });
    document = run(document, "address.set", {
      address: "controller/words/value",
      value: "Line one\nLine two",
    });
    const title = resolved(document, "layer/a/param/title");
    expect(effectiveValue(document, title)).toBe("Line one Line two");
    const layer = document.layers.a;
    if (layer?.kind !== "visual") throw new Error("No Layer.");
    expect(layer.parameters.title).toBe("Authored");
    const effective = effectiveLayer(document, layer, catalog);
    expect(effective).toMatchObject({
      parameters: {
        title: "Line one Line two",
        body: "Line one\nLine two",
        size: 1,
      },
    });
    expect(effectiveDocument(document, catalog).layers.a).toBe(effective);
  });
});
