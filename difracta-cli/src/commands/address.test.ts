import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { firedDetail, writtenValue } from "./address.ts";

describe("firedDetail", () => {
  it("says nothing for a Cue or a Scene", () => {
    expect(
      firedDetail({
        address: "scene/s/play",
        typed: "scene/Live/play",
        ok: true,
        warnings: [],
      }),
    ).toBe("");
  });

  it("counts a Macro's actions and skips in All", () => {
    expect(
      firedDetail({
        address: "macro/m/run",
        typed: "macro/Hit/run",
        ok: true,
        actions: 1,
        warnings: [],
      }),
    ).toBe(" (1 action)");
    expect(
      firedDetail({
        address: "macro/m/run",
        typed: "macro/Hit/run",
        ok: true,
        actions: 5,
        warnings: ["Hit: gone"],
      }),
    ).toBe(" (5 actions, 1 skipped)");
  });

  it("adds what another Run Mode picked and fired", () => {
    const base = {
      address: "macro/m/run",
      typed: "macro/Shimmer/run",
      ok: true,
      actions: 12,
    };
    expect(
      firedDetail({
        ...base,
        mode: "some",
        picked: 3,
        fired: 2,
        warnings: ["x"],
      }),
    ).toBe(" (12 actions, some 3: 3 picked, 2 fired, 1 skipped)");
    expect(
      firedDetail({ ...base, mode: "one", picked: 1, fired: 0, warnings: [] }),
    ).toBe(" (12 actions, one: 1 picked, 0 fired)");
    expect(
      firedDetail({
        ...base,
        mode: "sequence",
        picked: 1,
        fired: 1,
        warnings: [],
      }),
    ).toBe(" (12 actions, sequence: 1 picked, 1 fired)");
  });
});

describe("writtenValue", () => {
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
          size: { kind: "number", label: "Size", default: 1, min: 0, max: 4 },
          logo: { kind: "media", label: "Logo", accepts: "image", default: "" },
        },
      },
    ],
  });
  const registry = createBuiltInRegistry(catalog);

  function stage(): Document {
    let document = emptyDocument("Living");
    for (const [name, payload] of [
      ["scene.create", { id: "s", name: "Live" }],
      ["layer.create", { id: "a", sceneId: "s", kind: "visual" }],
      ["layer.visual", { layerId: "a", visual: "caption" }],
      ["controller.create", { id: "words", kind: "text", name: "Words" }],
      ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
      ["media.create", { id: "m", kind: "file", name: "Logo", path: "l.png" }],
    ] as const) {
      const result = executeCommand(registry, document, name, payload);
      if (!result.ok) throw new Error(result.error);
      document = result.document;
    }
    return document;
  }

  it("sends a text Address what was typed, numbers and switches included", () => {
    const document = stage();
    const title = "layer/a/param/title";
    expect(writtenValue(document, catalog, title, "Boa noite")).toBe(
      "Boa noite",
    );
    expect(writtenValue(document, catalog, title, "42")).toBe("42");
    expect(writtenValue(document, catalog, title, "true")).toBe("true");
    expect(writtenValue(document, catalog, title, "")).toBe("");
    expect(writtenValue(document, catalog, title, "Logo")).toBe("Logo");
    // A Controller's type needs no Catalog.
    const words = "controller/words/value";
    expect(writtenValue(document, undefined, words, "2026")).toBe("2026");
    expect(writtenValue(document, undefined, words, "one\ntwo")).toBe(
      "one\ntwo",
    );
    expect(writtenValue(document, undefined, words, '"one\\ntwo"')).toBe(
      "one\ntwo",
    );
  });

  it("reads any other value by its looks, a Media item's name becoming its id", () => {
    const document = stage();
    expect(writtenValue(document, catalog, "layer/a/param/size", "2")).toBe(2);
    expect(writtenValue(document, catalog, "layer/a/param/logo", "Logo")).toBe(
      "m",
    );
    expect(writtenValue(document, undefined, "layer/a/enabled", "false")).toBe(
      false,
    );
    expect(
      writtenValue(document, undefined, "controller/energy/value", "0.5"),
    ).toBe(0.5);
    expect(
      writtenValue(document, undefined, "installation/blackout", "true"),
    ).toBe(true);
  });
});
