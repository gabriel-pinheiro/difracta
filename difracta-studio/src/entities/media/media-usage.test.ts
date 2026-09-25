import {
  emptyDocument,
  id as brand,
  type Catalog,
  type VisualLayer,
} from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import { describe, expect, it } from "vitest";

import { layersUsing } from "./media-usage";

const catalog: Catalog = builtInCatalog;

function visualLayer(
  id: string,
  visual: string | null,
  parameters: Record<string, string>,
  order: string,
): VisualLayer {
  return {
    id: brand("layer", id),
    kind: "visual",
    name: id,
    sceneId: brand("scene", "scene_a"),
    parentId: null,
    enabled: true,
    visual,
    target: null,
    paths: {},
    parameters,
    opacity: 1,
    blendMode: "normal",
    order,
  };
}

describe("layersUsing", () => {
  it("finds the Layers whose media Parameter holds the item, in order", () => {
    const document = {
      ...emptyDocument("Test"),
      layers: {
        late: visualLayer("late", "image", { media: "media_x" }, "b"),
        other: visualLayer("other", "image", { media: "media_y" }, "a"),
        early: visualLayer("early", "image", { media: "media_x" }, "a"),
        unknown: visualLayer(
          "unknown",
          "not-in-catalog",
          { media: "media_x" },
          "a",
        ),
        empty: visualLayer("empty", null, { media: "media_x" }, "a"),
      },
    };
    expect(
      layersUsing(document, catalog, "media_x").map((use) => [
        use.layer.id,
        use.parameter,
        use.label,
      ]),
    ).toEqual([
      ["early", "media", "Image"],
      ["late", "media", "Image"],
    ]);
    expect(layersUsing(document, catalog, "media_none")).toEqual([]);
  });
});
