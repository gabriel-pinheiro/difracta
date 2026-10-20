import { builtInCommands } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { sliceDragPayload } from "./slice-drag";

const update = builtInCommands.find(
  (command) => command.name === "slice.update",
);
const key = (payload: unknown) =>
  (update?.coalesceKey as ((value: unknown) => string) | undefined)?.(payload);

describe("sliceDragPayload", () => {
  it("sends steps of one drag under one coalesce key per Slice and field", () => {
    const first = sliceDragPayload("sl_a", { position: { x: 0, y: 0 } });
    const second = sliceDragPayload("sl_a", { position: { x: 40, y: -3 } });
    expect(second).toEqual({ sliceId: "sl_a", position: { x: 40, y: -3 } });
    expect(key(first)).toBeDefined();
    expect(key(first)).toBe(key(second));
    expect(key(sliceDragPayload("sl_a", { scale: 2 }))).not.toBe(key(first));
    expect(
      key(sliceDragPayload("sl_b", { position: { x: 0, y: 0 } })),
    ).not.toBe(key(first));
  });

  it("sends a resize as the whole rectangle", () => {
    expect(
      sliceDragPayload("sl_a", { rect: { x: 0, y: 0, width: 10, height: 5 } }),
    ).toEqual({ sliceId: "sl_a", rect: { x: 0, y: 0, width: 10, height: 5 } });
  });
});
