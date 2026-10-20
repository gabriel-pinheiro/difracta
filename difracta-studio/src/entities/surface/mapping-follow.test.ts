import type { Slice, SurfaceMapping } from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  followLabel,
  followPayload,
  positionOptions,
  positionValue,
} from "./mapping-follow";

const corners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};
const slices = [
  { id: "sl_c", name: "Center" },
  { id: "sl_l", name: "Left" },
] as unknown as readonly Slice[];

describe("Position select", () => {
  it("offers corners alone without Slices, the frame and each Slice with them", () => {
    expect(positionOptions([]).map((option) => option.value)).toEqual([
      "corners",
    ]);
    expect(positionOptions(slices)).toEqual([
      { value: "corners", label: "Corners" },
      { value: "frame", label: "Whole frame" },
      { value: "sl_c", label: "Slice Center" },
      { value: "sl_l", label: "Slice Left" },
    ]);
  });

  it("reads what a mapping follows", () => {
    const mapping: SurfaceMapping = { enabled: true, corners };
    expect(positionValue(mapping)).toBe("corners");
    expect(positionValue({ ...mapping, follow: { frame: true } })).toBe(
      "frame",
    );
    expect(positionValue({ ...mapping, follow: { slice: "sl_c" } })).toBe(
      "sl_c",
    );
  });

  it("sends surface.follow with the Slice, the frame, or null to unlink", () => {
    expect(followPayload("sur", "out", "sl_c")).toEqual({
      surfaceId: "sur",
      output: "out",
      follow: "sl_c",
    });
    expect(followPayload("sur", "out", "frame").follow).toBe("frame");
    expect(followPayload("sur", "out", "corners").follow).toBeNull();
  });

  it("says what a following mapping follows", () => {
    expect(followLabel({ slice: "sl_l" }, slices)).toBe("Follows Slice Left");
    expect(followLabel({ frame: true }, slices)).toBe(
      "Follows the whole frame",
    );
  });
});
