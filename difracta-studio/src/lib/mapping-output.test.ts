import type { Calibration, Output, Surface } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { followedOutput, mappingOutput } from "./mapping-output";

const outputs = (...ids: string[]) =>
  ids.map((id) => ({ id, name: id })) as unknown as Output[];
const calibrating = (surfaceId: string, outputId: string) =>
  ({ surfaceId, outputId }) as Calibration;

describe("mappingOutput", () => {
  it("is the only Output a Surface is on", () => {
    expect(mappingOutput("wall", null, undefined, outputs("a"))).toBe("a");
    expect(mappingOutput("wall", null, undefined, [])).toBeUndefined();
  });

  it("is none with several Outputs until one is picked", () => {
    const enabled = outputs("a", "b");
    expect(mappingOutput("wall", null, undefined, enabled)).toBeUndefined();
    expect(mappingOutput("wall", null, "b", enabled)).toBe("b");
  });

  it("forgets a pick the Surface is no longer on", () => {
    expect(mappingOutput("wall", null, "b", outputs("a", "c"))).toBeUndefined();
    expect(mappingOutput("wall", null, "b", outputs("a"))).toBe("a");
  });

  it("is the Output showing the Surface's pattern, over the pick", () => {
    const enabled = outputs("a", "b");
    expect(mappingOutput("wall", calibrating("wall", "a"), "b", enabled)).toBe(
      "a",
    );
    expect(mappingOutput("wall", calibrating("floor", "a"), "b", enabled)).toBe(
      "b",
    );
  });
});

const surface = (mappings: Record<string, boolean>) =>
  ({
    id: "wall",
    mappings: Object.fromEntries(
      Object.entries(mappings).map(([id, enabled]) => [id, { enabled }]),
    ),
  }) as unknown as Surface;

describe("followedOutput", () => {
  it("stays on the calibrated Output when the Surface is on it", () => {
    expect(followedOutput(surface({ a: true, b: true }), "a")).toBe("a");
  });

  it("moves to the Surface's only Output", () => {
    expect(followedOutput(surface({ a: false, b: true }), "a")).toBe("b");
  });

  it("does not move with several Outputs to choose from, or none", () => {
    expect(followedOutput(surface({ b: true, c: true }), "a")).toBeUndefined();
    expect(followedOutput(surface({ a: false }), "a")).toBeUndefined();
  });
});
