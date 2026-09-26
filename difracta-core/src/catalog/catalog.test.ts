import { describe, expect, it } from "vitest";

import {
  Catalog,
  type FilterDefinition,
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
});
