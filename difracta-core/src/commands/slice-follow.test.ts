import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { resolveCalibration } from "../document/calibration.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { enabledCorners } from "../document/mappings.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

/**
 * LED (sliced, 200×100: Left at 0..100 and Right placed at 300..400) and
 * Projector (unsliced); Wall was on both before the Slices existed.
 */
function stage(): Document {
  let document = emptyDocument("Stage");
  for (const [name, payload] of [
    ["output.create", { id: "out_a", name: "LED" }],
    ["output.create", { id: "out_b", name: "Projector" }],
    [
      "surface.create",
      { id: "sur_a", name: "Wall", outputs: ["out_a", "out_b"] },
    ],
    [
      "output.update",
      { outputId: "out_a", displaySize: { width: 200, height: 100 } },
    ],
    [
      "slice.create",
      {
        id: "sl_l",
        outputId: "out_a",
        name: "Left",
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
    ],
    [
      "slice.create",
      {
        id: "sl_r",
        outputId: "out_a",
        name: "Right",
        rect: { x: 100, y: 0, width: 100, height: 100 },
        position: { x: 300, y: 0 },
      },
    ],
  ] as const)
    document = run(document, name, payload);
  return document;
}

describe("surface.follow", () => {
  it("follows a Slice of the Output, leaving the corners dormant", () => {
    const before = stage();
    const document = run(before, "surface.follow", {
      surfaceId: "sur_a",
      output: "out_a",
      follow: "sl_r",
    });
    const mapping = document.surfaces.sur_a!.mappings.out_a!;
    expect(mapping.follow).toEqual({ slice: "sl_r" });
    expect(mapping.corners).toEqual(
      before.surfaces.sur_a!.mappings.out_a!.corners,
    );
    expect(enabledCorners(document, document.surfaces.sur_a!, "out_a")).toEqual(
      {
        topLeft: { x: 0.75, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0.75, y: 1 },
      },
    );
  });

  it("unlinks into the resolved quad, so the Surface does not jump", () => {
    const following = run(stage(), "surface.follow", {
      surfaceId: "sur_a",
      output: "out_a",
      follow: "sl_r",
    });
    const unlinked = run(following, "surface.follow", {
      surfaceId: "sur_a",
      output: "out_a",
      follow: null,
    });
    expect(unlinked.surfaces.sur_a!.mappings.out_a).toEqual({
      enabled: true,
      corners: enabledCorners(following, following.surfaces.sur_a!, "out_a"),
    });
  });

  it("is refused on an Output without Slices and for another Output's Slice", () => {
    expect(
      refuse(stage(), "surface.follow", {
        surfaceId: "sur_a",
        output: "out_b",
        follow: "frame",
      }),
    ).toMatch(/has no Slices/);
    let document = run(stage(), "output.update", {
      outputId: "out_b",
      displaySize: { width: 100, height: 100 },
    });
    document = run(document, "slice.create", {
      id: "sl_b",
      outputId: "out_b",
      name: "Only",
    });
    expect(
      refuse(document, "surface.follow", {
        surfaceId: "sur_a",
        output: "out_a",
        follow: "sl_b",
      }),
    ).toBe("Slice “sl_b” is not a Slice of Output “LED”.");
  });
});

describe("corners of a following mapping", () => {
  it("are refused, naming what it follows", () => {
    const document = run(stage(), "surface.follow", {
      surfaceId: "sur_a",
      output: "out_a",
      follow: "sl_l",
    });
    expect(
      refuse(document, "surface.corner.nudge", {
        surfaceId: "sur_a",
        output: "out_a",
        corner: "topLeft",
        by: { x: 0.01, y: 0 },
      }),
    ).toMatch(/follows Slice “Left” there; unlink it/);
  });
});

describe("a new mapping on an Output with Slices", () => {
  it("starts on the whole frame from surface.create and surface.assign", () => {
    let document = run(stage(), "surface.create", {
      id: "sur_b",
      name: "Stage",
      outputs: ["out_a", "out_b"],
    });
    expect(document.surfaces.sur_b!.mappings.out_a!.follow).toEqual({
      frame: true,
    });
    expect(document.surfaces.sur_b!.mappings.out_b!.follow).toBeUndefined();
    document = run(document, "surface.create", {
      id: "sur_c",
      name: "Floor",
      outputs: ["out_b"],
    });
    document = run(document, "surface.assign", {
      surfaceId: "sur_c",
      outputs: ["out_a"],
    });
    expect(document.surfaces.sur_c!.mappings.out_a!.follow).toEqual({
      frame: true,
    });
  });
});

describe("calibration.set with a Slice", () => {
  const base = {
    surfaceId: null,
    outputId: "out_a",
    outputMaskId: null,
    maskId: null,
    pathId: null,
    regionId: null,
    corner: null,
    point: null,
    view: "patterns",
    owner: "session_1",
  };

  it("shows the Slice test card on the Output alone", () => {
    const document = run(stage(), "calibration.set", {
      ...base,
      sliceId: "sl_r",
    });
    expect(resolveCalibration(document)?.slice?.name).toBe("Right");
    const removed = run(document, "slice.remove", { sliceId: "sl_r" });
    expect(resolveCalibration(removed)).toBeUndefined();
  });

  it("is refused with a Surface or another Output's Slice", () => {
    expect(
      refuse(stage(), "calibration.set", {
        ...base,
        surfaceId: "sur_a",
        sliceId: "sl_r",
      }),
    ).toMatch(/Slice test card shows on its Output alone/);
    expect(
      refuse(stage(), "calibration.set", {
        ...base,
        outputId: "out_b",
        sliceId: "sl_r",
      }),
    ).toMatch(/is not a Slice of “Projector”/);
  });
});
