import { describe, expect, it } from "vitest";

import {
  Catalog,
  type FilterDefinition,
  type FontDefinition,
  type MediaDefinition,
  type VisualDefinition,
} from "./catalog.ts";

const visual: VisualDefinition = {
  kind: "visual",
  id: "wash",
  name: "Wash",
  description: "Fills.",
  backend: "shader",
  parameters: {},
};
const filter: FilterDefinition = {
  kind: "filter",
  id: "shake",
  name: "Shake",
  description: "Shakes.",
  backend: "shader",
  parameters: {},
};
const flash: MediaDefinition = {
  kind: "media",
  id: "flash",
  name: "Flash Cut",
  description: "A white flash.",
  type: "video",
  hit: true,
  file: "clips/flash.webm",
  width: 1920,
  height: 1080,
  duration: 1,
};
const beam: MediaDefinition = {
  kind: "media",
  id: "beam",
  name: "Beam Scan",
  description: "Beams.",
  type: "video",
  loop: true,
  recommended: true,
  file: "clips/beam.webm",
  width: 1920,
  height: 1080,
  duration: 7,
};
const sans: FontDefinition = {
  kind: "font",
  id: "sans",
  name: "Sans",
  description: "Plain.",
  files: ["sans-latin.woff2", "sans-latin-ext.woff2"],
};
const display: FontDefinition = {
  kind: "font",
  id: "display",
  name: "Display",
  description: "Loud.",
  files: ["display.woff2"],
};

describe("Catalog", () => {
  it("holds Bundled Media as a third kind, listed by name", () => {
    const catalog = new Catalog({
      visuals: [visual],
      filters: [filter],
      media: [flash, beam],
    });
    expect(catalog.media().map((entry) => entry.id)).toEqual(["beam", "flash"]);
    expect(catalog.definition("media", "flash")).toBe(flash);
    expect(catalog.mediaEntry("beam")).toBe(beam);
    expect(catalog.definition("media", "wash")).toBeUndefined();
    expect(catalog.definition("visual", "flash")).toBeUndefined();
    expect(new Catalog().media()).toEqual([]);
  });

  it("refuses an id twice, within a kind or across kinds", () => {
    expect(() => new Catalog({ media: [flash, flash] })).toThrow(
      "Bundled Media entry “flash” is in the Catalog twice.",
    );
    expect(
      () =>
        new Catalog({ visuals: [visual], media: [{ ...flash, id: "wash" }] }),
    ).toThrow("has the id of a Visual");
    expect(
      () =>
        new Catalog({
          filters: [filter],
          visuals: [{ ...visual, id: "shake" }],
        }),
    ).toThrow("has the id of a Visual");
  });

  it("holds the Bundled Fonts in the order given, the fallback first", () => {
    const catalog = new Catalog({ visuals: [visual], fonts: [sans, display] });
    expect(catalog.fonts().map((font) => font.id)).toEqual(["sans", "display"]);
    expect(catalog.font("display")).toBe(display);
    expect(catalog.font("wash")).toBeUndefined();
    expect(catalog.visual("sans")).toBeUndefined();
    expect(new Catalog().fonts()).toEqual([]);
  });

  it("refuses a Bundled Font's id twice, or one a Visual has", () => {
    expect(() => new Catalog({ fonts: [sans, sans] })).toThrow(
      "Bundled Font “sans” is in the Catalog twice.",
    );
    expect(
      () =>
        new Catalog({ visuals: [visual], fonts: [{ ...sans, id: "wash" }] }),
    ).toThrow("has the id of a Visual");
  });
});
