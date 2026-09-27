import type { Output, Surface, Table } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { outputWarningCount, outputWithoutSurface } from "./output-warning";

const outputs = {
  wall: { id: "wall", name: "Wall", order: "a0" },
  side: { id: "side", name: "Side", order: "a1" },
} as unknown as Table<Output>;

const surfaces = {
  front: { id: "front", mappings: { wall: { enabled: true } } },
  back: { id: "back", mappings: { side: { enabled: false } } },
} as unknown as Table<Surface>;

describe("Output warnings", () => {
  it("flags an Output no Surface is on", () => {
    expect(outputWithoutSurface("wall", surfaces)).toBe(false);
    expect(outputWithoutSurface("side", surfaces)).toBe(true);
  });

  it("counts the rows that warn", () => {
    expect(outputWarningCount(outputs, surfaces)).toBe(1);
    expect(outputWarningCount(outputs, {})).toBe(2);
    expect(outputWarningCount({}, surfaces)).toBe(0);
  });
});
