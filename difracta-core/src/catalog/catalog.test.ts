import { describe, expect, it } from "vitest";

import {
  Catalog,
  type FilterDefinition,
  type FontDefinition,
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
  it("refuses an id twice, within a kind or across kinds", () => {
    expect(() => new Catalog({ fonts: [sans, sans] })).toThrow(
      "Bundled Font “sans” is in the Catalog twice.",
    );
    expect(
      () =>
        new Catalog({ visuals: [visual], fonts: [{ ...sans, id: "wash" }] }),
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
