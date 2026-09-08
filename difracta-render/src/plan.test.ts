import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { planFrame } from "./plan.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function installation(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out_a", name: "A" });
  document = run(document, "output.create", { id: "out_b", name: "B" });
  document = run(document, "surface.create", {
    id: "sur_wall",
    name: "Wall",
    output: "out_a",
  });
  document = run(document, "surface.create", {
    id: "sur_floor",
    name: "Floor",
    output: "out_a",
  });
  document = run(document, "surface.create", {
    id: "sur_tv",
    name: "TV",
    output: "out_b",
  });
  document = run(document, "surface.create", {
    id: "sur_loose",
    name: "Loose",
    output: null,
  });
  return run(document, "mask.create", {
    id: "mask_door",
    surfaceId: "sur_wall",
    name: "Door",
  });
}

const calibration = {
  surfaceId: "sur_wall",
  maskId: null,
  corner: "topRight",
  point: null,
  view: "selected",
  owner: "s1",
};

describe("planFrame", () => {
  it("fills every assigned Surface with its Masks outside Calibration Mode", () => {
    const plan = planFrame(installation(), "out_a");
    expect(plan.blackout).toBe(false);
    expect(
      plan.draws.map((draw) => [
        draw.surface.id,
        draw.style,
        draw.masks.length,
      ]),
    ).toEqual([
      ["sur_wall", "fill", 1],
      ["sur_floor", "fill", 0],
    ]);
  });

  it("draws nothing under Blackout", () => {
    const document = run(installation(), "address.set", {
      address: "installation/blackout",
      value: true,
    });
    expect(planFrame(document, "out_a")).toEqual({ blackout: true, draws: [] });
  });

  it("shows the calibrated Surface as a pattern with its corner, others per view", () => {
    const selected = run(installation(), "calibration.set", calibration);
    expect(
      planFrame(selected, "out_a").draws.map((draw) => [
        draw.surface.id,
        draw.style,
        draw.highlighted,
        draw.corner,
        draw.masks.length,
      ]),
    ).toEqual([["sur_wall", "pattern", true, "topRight", 0]]);
    const outlines = run(selected, "calibration.set", {
      ...calibration,
      view: "outlines",
    });
    expect(
      planFrame(outlines, "out_a").draws.map((draw) => draw.style),
    ).toEqual(["pattern", "outline"]);
    const patterns = run(selected, "calibration.set", {
      ...calibration,
      view: "patterns",
    });
    expect(
      planFrame(patterns, "out_a").draws.map((draw) => [
        draw.style,
        draw.highlighted,
      ]),
    ).toEqual([
      ["pattern", true],
      ["pattern", false],
    ]);
    // The other Output is unaffected.
    expect(planFrame(patterns, "out_b").draws.map((d) => d.style)).toEqual([
      "fill",
    ]);
  });

  it("applies and outlines the Mask being aligned", () => {
    const document = run(installation(), "calibration.set", {
      ...calibration,
      maskId: "mask_door",
      corner: null,
      point: 2,
    });
    const [wall] = planFrame(document, "out_a").draws;
    expect(wall?.masks.map((mask) => mask.id)).toEqual(["mask_door"]);
    expect(wall?.corner).toBeUndefined();
    expect(wall?.maskOutline?.mask.id).toBe("mask_door");
    expect(wall?.maskOutline?.point).toBe(2);
  });
});
