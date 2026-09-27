import { describe, expect, it } from "vitest";

import { linkAt } from "../address/links.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { settings } from "../settings.ts";
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

const TOO_LONG = "a".repeat(settings.text.maxLength + 1);
const AT_MOST = `must be at most ${String(settings.text.maxLength)} characters (got ${String(settings.text.maxLength + 1)})`;

describe("text Parameters on a Layer", () => {
  it("takes the defaults on a pick, and given text over them", () => {
    let document = stage();
    expect(parameters(document, "a")).toEqual({
      title: "Text",
      body: "",
      size: 1,
    });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "caption",
      parameters: { title: "", body: "one\ntwo" },
    });
    expect(parameters(document, "a")).toEqual({
      title: "",
      body: "one\ntwo",
      size: 1,
    });
  });

  it("refuses text a pick's Parameter cannot hold", () => {
    const document = stage();
    const pick = (values: Record<string, unknown>): string =>
      failure(document, "layer.visual", {
        layerId: "a",
        visual: "caption",
        parameters: values,
      });
    expect(pick({ title: "one\ntwo" })).toBe(
      "Parameter “title” must be a single line. See `difracta catalog caption`.",
    );
    expect(pick({ title: 12 })).toBe(
      "Parameter “title” must be a string of text. See `difracta catalog caption`.",
    );
    expect(pick({ body: TOO_LONG })).toBe(
      `Parameter “body” ${AT_MOST}. See \`difracta catalog caption\`.`,
    );
  });

  it("resets text to its default, a linked one keeping what was authored", () => {
    let document = stage();
    for (const [address, value] of [
      ["layer/a/param/title", "Authored"],
      ["layer/a/param/body", "one\ntwo"],
    ] as const)
      document = run(document, "address.edit", { address, value });
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title"],
    });
    document = run(document, "layer.reset", { layerId: "a" });
    expect(parameters(document, "a")).toEqual({
      title: "Authored",
      body: "",
      size: 1,
    });
  });

  it("duplicates a Layer with its text and its Link", () => {
    let document = stage();
    document = run(document, "address.edit", {
      address: "layer/a/param/body",
      value: "one\ntwo",
    });
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title"],
    });
    document = run(document, "layer.duplicate", { layerId: "a", id: "b" });
    expect(parameters(document, "b")).toEqual(parameters(document, "a"));
    expect(linkAt(document, "layer/b/param/title")).toMatchObject({
      controllerId: "words",
      anchors: null,
    });
  });

  it("keeps a text Link across a pick only while the Parameter stays text", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "words",
      addresses: ["layer/a/param/title", "layer/a/param/body"],
    });
    document = run(document, "layer.visual", {
      layerId: "a",
      visual: "ticker",
    });
    expect(linkAt(document, "layer/a/param/title")?.controllerId).toBe("words");
    expect(linkAt(document, "layer/a/param/body")).toBeUndefined();
  });
});

describe("text Addresses written", () => {
  it("accepts text, the empty string included, through set and edit", () => {
    let document = stage();
    document = run(document, "address.edit", {
      address: "layer/a/param/title",
      value: "Olá",
    });
    expect(parameters(document, "a").title).toBe("Olá");
    document = run(document, "address.set", {
      address: "layer/a/param/title",
      value: "",
    });
    expect(parameters(document, "a").title).toBe("");
    document = run(document, "address.set", {
      address: "controller/words/value",
      value: "one\ntwo",
    });
    expect(document.controllers.words).toMatchObject({ value: "one\ntwo" });
  });

  it("refuses what is not text, too long, or broken over lines on a single line", () => {
    const document = stage();
    for (const command of ["address.set", "address.edit"]) {
      const write = (address: string, value: unknown): string =>
        failure(document, command, { address, value });
      expect(write("layer/a/param/title", 12)).toBe(
        "Title must be a string of text.",
      );
      expect(write("layer/a/param/title", true)).toBe(
        "Title must be a string of text.",
      );
      expect(write("layer/a/param/title", "one\ntwo")).toBe(
        "Title must be a single line.",
      );
      expect(write("layer/a/param/body", TOO_LONG)).toBe(`Body ${AT_MOST}.`);
      expect(write("controller/words/value", TOO_LONG)).toBe(
        `Value ${AT_MOST}.`,
      );
      expect(write("controller/words/value", [1, 1, 1, 1])).toBe(
        "Value must be a string of text.",
      );
      expect(write("controller/energy/value", "loud")).toBe(
        "Value must be a number.",
      );
    }
  });
});

describe("a Macro's set action on text", () => {
  it("validates on add and on update, and writes when the Macro runs", () => {
    let document = stage();
    document = run(document, "macro.create", { id: "m", name: "Announce" });
    const add = (address: string, value: unknown) => ({
      macroId: "m",
      actions: [{ kind: "set", address, value }],
    });
    expect(
      failure(document, "macro.actions.add", add("layer/a/param/title", 5)),
    ).toBe("Title: The value must be a string of text.");
    expect(
      failure(
        document,
        "macro.actions.add",
        add("layer/a/param/title", "one\ntwo"),
      ),
    ).toBe("Title: The value must be a single line.");
    expect(
      failure(
        document,
        "macro.actions.add",
        add("controller/words/value", TOO_LONG),
      ),
    ).toBe(`Value: The value ${AT_MOST}.`);
    document = run(
      document,
      "macro.actions.add",
      add("layer/a/param/title", "Tonight"),
    );
    document = run(
      document,
      "macro.actions.add",
      add("controller/words/value", "one\ntwo"),
    );
    const macro = document.macros.m;
    if (macro?.kind !== "macro") throw new Error("No Macro.");
    const [first] = macro.actions;
    expect(
      failure(document, "macro.action.update", {
        macroId: "m",
        actionId: first?.id ?? "",
        value: "one\ntwo",
      }),
    ).toBe("The value must be a single line.");
    document = run(document, "macro.action.update", {
      macroId: "m",
      actionId: first?.id ?? "",
      value: "",
    });
    document = run(document, "address.trigger", { address: "macro/m/run" });
    expect(parameters(document, "a").title).toBe("");
    expect(document.controllers.words).toMatchObject({ value: "one\ntwo" });
  });
});
