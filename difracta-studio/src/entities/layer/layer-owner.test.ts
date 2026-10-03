import type { Layer, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { layerHolder, layerOwnerName } from "./layer-owner";

const layers = {
  grp: { id: "grp", kind: "group", name: "Sky", parentId: null },
  clip: { id: "clip", kind: "visual", name: "Intro clip", parentId: "grp" },
  hue: { id: "hue", kind: "filter", name: "Hue Shift", parentId: "clip" },
  glitch: { id: "glitch", kind: "filter", name: "Glitch", parentId: "grp" },
} as unknown as Table<Layer>;

describe("layerOwnerName", () => {
  it("names a nested Filter after its Visual Layer, every other Layer by itself", () => {
    expect(layerOwnerName(layers, layers.hue!)).toBe("Intro clip › Hue Shift");
    expect(layerOwnerName(layers, layers.glitch!)).toBe("Glitch");
    expect(layerOwnerName(layers, layers.clip!)).toBe("Intro clip");
  });

  it("finds the Visual Layer only for a Filter inside one", () => {
    expect(layerHolder(layers, layers.hue!)?.id).toBe("clip");
    expect(layerHolder(layers, layers.glitch!)).toBeUndefined();
    expect(layerHolder(layers, layers.clip!)).toBeUndefined();
  });
});
