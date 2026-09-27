import type { Output, Surface, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { surfaceOutputsLabel, surfaceWarningCount } from "./surface-warning";

const outputs = {
  wall: { id: "wall", name: "Wall", order: "a0" },
  tv: { id: "tv", name: "TV", order: "a1" },
} as unknown as Table<Output>;

const surfaces = {
  front: { id: "front", mappings: { wall: { enabled: true } } },
  score: {
    id: "score",
    mappings: { wall: { enabled: true }, tv: { enabled: true } },
  },
  back: { id: "back", mappings: {} },
  off: { id: "off", mappings: { wall: { enabled: false } } },
  side: { id: "side", mappings: { gone: { enabled: true } } },
} as unknown as Table<Surface>;

describe("Surface warnings", () => {
  it("names the Output a Surface is on, or counts them", () => {
    expect(surfaceOutputsLabel(surfaces.front!, outputs)).toBe("Wall");
    expect(surfaceOutputsLabel(surfaces.score!, outputs)).toBe("2 Outputs");
    expect(surfaceOutputsLabel(surfaces.back!, outputs)).toBeUndefined();
    expect(surfaceOutputsLabel(surfaces.off!, outputs)).toBeUndefined();
    expect(surfaceOutputsLabel(surfaces.side!, outputs)).toBeUndefined();
  });

  it("counts Surfaces on no Output, or on one that is gone", () => {
    expect(surfaceWarningCount(surfaces, outputs)).toBe(3);
    expect(surfaceWarningCount({}, outputs)).toBe(0);
  });
});
