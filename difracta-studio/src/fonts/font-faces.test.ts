import type { FontDefinition } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import { describe, expect, it } from "vitest";

import {
  fontFaceSources,
  fontFamilies,
  fontStack,
  fontUrl,
} from "./font-faces.ts";

const font = (files: readonly string[]): FontDefinition => ({
  kind: "font",
  id: "inter",
  name: "Inter",
  description: "A neutral sans.",
  files,
});

describe("Bundled Font faces", () => {
  it("names a family per file: the font, then its further ranges", () => {
    expect(fontFamilies(font(["a.woff2"]))).toEqual(["Difracta inter"]);
    expect(fontFamilies(font(["a.woff2", "b.woff2", "c.woff2"]))).toEqual([
      "Difracta inter",
      "Difracta inter ext",
      "Difracta inter ext 2",
    ]);
  });

  it("finds a file under the runtime's fonts path", () => {
    expect(fontUrl("inter-latin.woff2")).toBe("/fonts/inter-latin.woff2");
    expect(fontUrl("my font.woff2")).toBe("/fonts/my%20font.woff2");
  });

  it("pairs each file with its family", () => {
    expect(
      fontFaceSources(font(["inter-latin.woff2", "inter-latin-ext.woff2"])),
    ).toEqual([
      { family: "Difracta inter", url: "/fonts/inter-latin.woff2" },
      { family: "Difracta inter ext", url: "/fonts/inter-latin-ext.woff2" },
    ]);
  });

  it("stacks the font's families before Studio's sans", () => {
    expect(fontStack(font(["a.woff2", "b.woff2"]))).toBe(
      '"Difracta inter", "Difracta inter ext", "Geist Variable", ui-sans-serif, sans-serif',
    );
    expect(fontStack(font(["a.woff2"]))).toBe(
      '"Difracta inter", "Geist Variable", ui-sans-serif, sans-serif',
    );
  });

  it("gives every Bundled Font of the Catalog families of its own", () => {
    const families = builtInCatalog.fonts().flatMap(fontFamilies);
    expect(families.length).toBeGreaterThan(0);
    expect(new Set(families).size).toBe(families.length);
  });
});
