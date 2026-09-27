import { describe, expect, it } from "vitest";

import { gridColumns } from "./text-rasters.ts";

describe("gridColumns", () => {
  it("lays cells out in the picture whose longer side is shortest", () => {
    // Eleven cells one wide and 1.7 tall: four by three is 4 by 5.1.
    expect(gridColumns(11, 1, 1.7)).toBe(4);
    // Two wide cells are best one above the other.
    expect(gridColumns(2, 5, 1.7)).toBe(1);
    expect(gridColumns(1, 1, 1)).toBe(1);
  });

  it("never makes the picture longer than one column or one line would", () => {
    for (const count of [2, 5, 11, 40]) {
      const columns = gridColumns(count, 1, 1.7);
      const longer = Math.max(columns, Math.ceil(count / columns) * 1.7);
      expect(longer).toBeLessThanOrEqual(count);
      expect(longer).toBeLessThanOrEqual(count * 1.7);
    }
  });
});
