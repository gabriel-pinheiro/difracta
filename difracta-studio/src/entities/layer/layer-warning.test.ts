import {
  id,
  type Layer,
  type Path,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { layerWarning, layerWarningCount } from "./layer-warning.ts";

const base = {
  id: id("layer", "l"),
  name: "L",
  sceneId: id("scene", "s"),
  parentId: null,
  enabled: true,
  order: "a0",
};

function visual(
  visualId: string | null,
  target: string | null,
  paths: Record<string, string> = {},
): Layer {
  return {
    ...base,
    kind: "visual",
    visual: visualId,
    parameters: {},
    target,
    paths,
    opacity: 1,
    blendMode: "normal",
  };
}

describe("layerWarning", () => {
  it("names the missing Visual before the missing Target", () => {
    expect(layerWarning(visual(null, null))?.label).toBe("No Visual");
    expect(layerWarning(visual("stars", null))?.label).toBe("No Target");
    expect(layerWarning(visual(null, "wall"))?.label).toBe("No Visual");
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
    expect(layerWarning(filter)?.label).toBe("No Filter");
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

  it("names a Path the Visual follows that is unbound or off the Target", () => {
    const lightning: VisualDefinition = {
      id: "lightning",
      kind: "visual",
      name: "Lightning",
      description: "Bolts.",
      backend: "canvas",
      parameters: {},
      paths: [{ key: "route", label: "Route" }],
    };
    const path = (surfaceId: string): Path => ({
      id: id("path", "p"),
      name: "P",
      surfaceId,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      closed: false,
      order: "a0",
    });
    const context = (paths: Record<string, Path>, regions = {}) => ({
      definition: lightning,
      paths,
      regions,
    });
    const unbound = layerWarning(
      visual("lightning", "wall"),
      context({ p: path("wall") }),
    );
    expect(unbound).toEqual({
      label: "No Path",
      explanation:
        "Lightning follows a Path. Bind one in the inspector, or press + there to create it on the Target.",
    });
    expect(
      layerWarning(
        visual("lightning", "wall", { route: "p" }),
        context({ p: path("floor") }),
      )?.label,
    ).toBe("No Path");
    expect(
      layerWarning(visual("lightning", "wall", { route: "gone" }), context({}))
        ?.label,
    ).toBe("No Path");
    expect(
      layerWarning(
        visual("lightning", "wall", { route: "p" }),
        context({ p: path("wall") }),
      ),
    ).toBeUndefined();
    // The Target is named first, and a Visual without Paths needs none.
    expect(layerWarning(visual("lightning", null), context({}))?.label).toBe(
      "No Target",
    );
    // On a Region, the Path must be on the Region's Surface.
    const region = {
      id: id("region", "north"),
      name: "North",
      surfaceId: "wall",
      bounds: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 0.5, y: 0.5 } },
      order: "a0",
    };
    expect(
      layerWarning(
        visual("lightning", "north", { route: "p" }),
        context({ p: path("wall") }, { north: region }),
      ),
    ).toBeUndefined();
    expect(
      layerWarning(
        visual("lightning", "north", { route: "p" }),
        context({ p: path("floor") }, { north: region }),
      )?.label,
    ).toBe("No Path");
    expect(
      layerWarning(visual("stars", "wall"), {
        definition: { ...lightning, paths: [] },
        paths: {},
        regions: {},
      }),
    ).toBeUndefined();
  });
});

describe("layerWarningCount", () => {
  it("counts the Layers whose rows warn", () => {
    const layers = {
      a: { ...visual(null, "wall"), id: id("layer", "a") },
      b: { ...visual("stars", "wall"), id: id("layer", "b") },
      c: { ...visual("stars", null), id: id("layer", "c") },
      g: { ...base, id: id("layer", "g"), kind: "group" as const },
    };
    const none = () => ({ definition: undefined, paths: {}, regions: {} });
    expect(layerWarningCount(layers, none)).toBe(2);
    expect(layerWarningCount({}, none)).toBe(0);
  });
});
