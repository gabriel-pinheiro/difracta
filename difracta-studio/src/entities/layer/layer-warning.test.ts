import { id, type Layer } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { layerWarning } from "./layer-warning.ts";

const base = {
  id: id("layer", "l"),
  name: "L",
  sceneId: id("scene", "s"),
  parentId: null,
  enabled: true,
  order: "a0",
};

function visual(visualId: string | null, target: string | null): Layer {
  return {
    ...base,
    kind: "visual",
    visual: visualId,
    parameters: {},
    target,
    paths: {},
    opacity: 1,
    blendMode: "normal",
  };
}

describe("layerWarning", () => {
  it("names the missing Visual before the missing Target", () => {
    expect(layerWarning(visual(null, null))?.label).toBe("no Visual");
    expect(layerWarning(visual("stars", null))?.label).toBe("no Target");
    expect(layerWarning(visual(null, "wall"))?.label).toBe("no Visual");
    expect(layerWarning(visual("stars", "wall"))).toBeUndefined();
  });

  it("warns a Filter Layer without a Filter and never a Group", () => {
    const filter: Layer = {
      ...base,
      kind: "filter",
      filter: null,
      parameters: {},
      mix: 1,
    };
    expect(layerWarning(filter)?.label).toBe("no Filter");
    expect(
      layerWarning({
        ...base,
        kind: "filter",
        filter: "blur",
        parameters: {},
        mix: 1,
      }),
    ).toBeUndefined();
    expect(layerWarning({ ...base, kind: "group" })).toBeUndefined();
  });
});
