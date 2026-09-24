import type { Output, Surface, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { surfaceOutput, surfaceWarningCount } from "./surface-warning";

const outputs = {
  wall: { id: "wall", name: "Wall", order: "a0" },
} as unknown as Table<Output>;

const surfaces = {
  front: { id: "front", output: "wall" },
  back: { id: "back", output: null },
  side: { id: "side", output: "gone" },
} as unknown as Table<Surface>;

describe("Surface warnings", () => {
  it("finds the Output a Surface renders through", () => {
    expect(surfaceOutput(surfaces.front!, outputs)?.name).toBe("Wall");
    expect(surfaceOutput(surfaces.back!, outputs)).toBeUndefined();
    expect(surfaceOutput(surfaces.side!, outputs)).toBeUndefined();
  });

  it("counts Surfaces with no Output, or one that is gone", () => {
    expect(surfaceWarningCount(surfaces, outputs)).toBe(2);
    expect(surfaceWarningCount({}, outputs)).toBe(0);
  });
});
