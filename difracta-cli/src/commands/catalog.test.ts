import { Catalog, type FontDefinition } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { describeFont, describeParameter, formatCatalog } from "./catalog.ts";

const sans: FontDefinition = {
  kind: "font",
  id: "sans",
  name: "Sans",
  description: "The plain choice.",
  files: ["sans-latin.woff2", "sans-latin-ext.woff2"],
};
const display: FontDefinition = {
  kind: "font",
  id: "display",
  name: "Display",
  description: "For titles.",
  files: ["display.woff2"],
};

describe("describeParameter", () => {
  it("shows a text Parameter's default quoted and whether it takes line breaks", () => {
    expect(
      describeParameter({ kind: "text", label: "Prefix", default: "" }),
    ).toBe(`${"Prefix".padEnd(16)} text     default ""  a single line`);
    expect(
      describeParameter({
        kind: "text",
        label: "Text",
        default: "one\ntwo",
        multiline: true,
        description: "What to show.",
      }),
    ).toBe(
      `${"Text".padEnd(16)} text     default "one\\ntwo"  line breaks allowed  What to show.`,
    );
  });
});

describe("formatCatalog", () => {
  const caption = {
    kind: "visual",
    id: "caption",
    name: "Caption",
    description: "Words.",
    backend: "shader",
    parameters: {},
  } as const;

  it("lists the Bundled Fonts under their own heading, in the Catalog's order", () => {
    expect(
      formatCatalog(
        new Catalog({ visuals: [caption], fonts: [sans, display] }),
      ).split("\n"),
    ).toEqual([
      `${"caption".padEnd(20)} ${"visual".padEnd(8)} ${"shader".padEnd(8)}   Words.`,
      "",
      "Bundled Fonts",
      `${"sans".padEnd(20)} Sans: The plain choice.`,
      `${"display".padEnd(20)} Display: For titles.`,
    ]);
  });

  it("leaves the heading out of a Catalog without fonts", () => {
    expect(formatCatalog(new Catalog({ visuals: [caption] }))).not.toContain(
      "Bundled Fonts",
    );
  });
});

describe("describeFont", () => {
  it("says what the font is for, how to choose it and where its files are served", () => {
    expect(describeFont(sans).split("\n")).toEqual([
      "Sans  (Bundled Font)  id: sans",
      "The plain choice.",
      "",
      "A Visual's Font Parameter takes the id: edit layer/<id|name>/param/<key> sans",
      "",
      "Files",
      `  ${"sans-latin.woff2".padEnd(36)} GET /fonts/sans-latin.woff2`,
      `  ${"sans-latin-ext.woff2".padEnd(36)} GET /fonts/sans-latin-ext.woff2`,
    ]);
  });
});
