import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { resolveCalibration } from "../document/calibration.ts";
import {
  emptyDocument,
  MASK_POINTS,
  type Document,
} from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { createBuiltInRegistry } from "./index.ts";

const registry = createBuiltInRegistry();

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

/** Two Outputs; Wall is on both, Floor on the first only. */
function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["output.create", { id: "out_a", name: "Left" }],
    ["output.create", { id: "out_b", name: "Right" }],
    [
      "surface.create",
      { id: "sur_a", name: "Wall", outputs: ["out_a", "out_b"] },
    ],
    ["surface.create", { id: "sur_b", name: "Floor", outputs: ["out_a"] }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const calibration = {
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

describe("output-mask.create", () => {
  it("creates an exclude rectangle over the middle of the frame, named and ordered per Output", () => {
    const first = run(stage(), "output-mask.create", {
      id: "om_a",
      outputId: "out_a",
      name: "Window",
    });
    expect(first.document.outputMasks.om_a).toEqual({
      id: "om_a",
      name: "Window",
      outputId: "out_a",
      mode: "exclude",
      points: [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
      ],
      feather: 0,
      order: "a0",
    });
    expect(first.label).toBe("Create Output Mask “Window”");

    const sameOutput = run(first.document, "output-mask.create", {
      id: "om_b",
      outputId: "out_a",
      name: "Window",
    });
    expect(sameOutput.document.outputMasks.om_b).toMatchObject({
      name: "Window 1",
      order: "a1",
    });
    const otherOutput = run(sameOutput.document, "output-mask.create", {
      id: "om_c",
      outputId: "out_b",
      name: "Window",
    });
    expect(otherOutput.document.outputMasks.om_c).toMatchObject({
      name: "Window",
      order: "a0",
    });
  });

  it("refuses a missing Output or a taken id", () => {
    const document = run(stage(), "output-mask.create", {
      id: "om_a",
      outputId: "out_a",
      name: "Window",
    }).document;
    expect(
      refuse(document, "output-mask.create", { outputId: "out_x", name: "x" }),
    ).toContain("Output “out_x” does not exist");
    expect(
      refuse(document, "output-mask.create", {
        id: "om_a",
        outputId: "out_a",
        name: "x",
      }),
    ).toContain("already exists");
  });
});

describe("output-mask.rename, .update and .remove", () => {
  function withTwo(): Document {
    let document = stage();
    for (const [id, name] of [
      ["om_a", "Window"],
      ["om_b", "Beam"],
    ])
      document = run(document, "output-mask.create", {
        id,
        outputId: "out_a",
        name,
      }).document;
    return document;
  }

  it("renames uniquely among the Output's masks and coalesces per mask", () => {
    const document = withTwo();
    const renamed = run(document, "output-mask.rename", {
      outputMaskId: "om_b",
      name: "window",
    });
    expect(renamed.document.outputMasks.om_b?.name).toBe("window 1");
    expect(renamed.coalesceKey).toBe("output-mask.rename:om_b");
    expect(
      run(document, "output-mask.rename", {
        outputMaskId: "om_a",
        name: "Window",
      }).patches,
    ).toEqual([]);
  });

  it("changes mode and feather in one call and skips unchanged fields", () => {
    const updated = run(withTwo(), "output-mask.update", {
      outputMaskId: "om_a",
      mode: "include",
      feather: 0.05,
    });
    expect(updated.document.outputMasks.om_a).toMatchObject({
      mode: "include",
      feather: 0.05,
    });
    expect(updated.patches).toHaveLength(2);
    expect(updated.coalesceKey).toBe("output-mask.update:om_a");
    expect(
      run(updated.document, "output-mask.update", {
        outputMaskId: "om_a",
        mode: "include",
      }).patches,
    ).toEqual([]);
    expect(
      refuse(updated.document, "output-mask.update", {
        outputMaskId: "om_x",
        feather: 0,
      }),
    ).toContain("does not exist");
  });

  it("removes one mask, and every mask of an Output with the Output", () => {
    const document = withTwo();
    const removed = run(document, "output-mask.remove", {
      outputMaskId: "om_a",
    });
    expect(Object.keys(removed.document.outputMasks)).toEqual(["om_b"]);
    expect(
      refuse(removed.document, "output-mask.remove", { outputMaskId: "om_a" }),
    ).toContain("does not exist");
    const other = run(document, "output-mask.create", {
      id: "om_c",
      outputId: "out_b",
      name: "Window",
    }).document;
    const gone = run(other, "output.remove", { outputId: "out_a" });
    expect(Object.keys(gone.document.outputMasks)).toEqual(["om_c"]);
  });

  it("reorders among the Output's masks only", () => {
    let document = withTwo();
    document = run(document, "output-mask.create", {
      id: "om_c",
      outputId: "out_b",
      name: "Window",
    }).document;
    const moved = run(document, "entity.move", {
      table: "outputMasks",
      id: "om_b",
      after: null,
    });
    expect(
      orderedEntries(moved.document.outputMasks)
        .filter((mask) => mask.outputId === "out_a")
        .map((mask) => mask.id),
    ).toEqual(["om_b", "om_a"]);
    expect(
      refuse(document, "entity.move", {
        table: "outputMasks",
        id: "om_a",
        after: "om_c",
      }),
    ).toContain("not a sibling");
  });
});

describe("output-mask.point.*", () => {
  const start = () =>
    run(stage(), "output-mask.create", {
      id: "om_a",
      outputId: "out_a",
      name: "Window",
    }).document;
  const points = (document: Document) => document.outputMasks.om_a?.points;

  it("sets, nudges, adds and removes points with one coalesce key per point", () => {
    const set = run(start(), "output-mask.point.set", {
      outputMaskId: "om_a",
      index: 1,
      point: { x: 1.2, y: -0.1 },
    });
    expect(points(set.document)?.[1]).toEqual({ x: 1.2, y: -0.1 });
    expect(set.coalesceKey).toBe("output-mask.point:om_a:1");
    const nudged = run(set.document, "output-mask.point.nudge", {
      outputMaskId: "om_a",
      index: 1,
      by: { x: -0.2, y: 0.1 },
    });
    expect(points(nudged.document)?.[1]).toEqual({ x: 1, y: 0 });
    expect(nudged.coalesceKey).toBe("output-mask.point:om_a:1");
    expect(
      run(nudged.document, "output-mask.point.set", {
        outputMaskId: "om_a",
        index: 1,
        point: { x: 1, y: 0 },
      }).patches,
    ).toEqual([]);
    const added = run(nudged.document, "output-mask.point.add", {
      outputMaskId: "om_a",
      after: 3,
    });
    expect(points(added.document)).toHaveLength(5);
    expect(points(added.document)?.[4]).toEqual({ x: 0.25, y: 0.5 });
    const removed = run(added.document, "output-mask.point.remove", {
      outputMaskId: "om_a",
      index: 4,
    });
    expect(points(removed.document)).toEqual(points(nudged.document));
  });

  it("keeps the point count between the Mask bounds and refuses missing points", () => {
    let minimal = run(start(), "output-mask.point.remove", {
      outputMaskId: "om_a",
      index: 0,
    }).document;
    expect(points(minimal)).toHaveLength(MASK_POINTS.min);
    expect(
      refuse(minimal, "output-mask.point.remove", {
        outputMaskId: "om_a",
        index: 0,
      }),
    ).toBe(`An Output Mask keeps at least ${String(MASK_POINTS.min)} points.`);
    expect(
      refuse(minimal, "output-mask.point.set", {
        outputMaskId: "om_a",
        index: 3,
        point: { x: 0, y: 0 },
      }),
    ).toContain("Point 3 does not exist; the Output Mask has 3 points.");
    let full = minimal;
    while ((points(full)?.length ?? 0) < MASK_POINTS.max)
      full = run(full, "output-mask.point.add", {
        outputMaskId: "om_a",
        after: 0,
      }).document;
    expect(
      refuse(full, "output-mask.point.add", { outputMaskId: "om_a", after: 0 }),
    ).toBe(`An Output Mask has at most ${String(MASK_POINTS.max)} points.`);
    minimal = run(minimal, "output-mask.point.nudge", {
      outputMaskId: "om_a",
      index: 2,
      by: { x: 0, y: 0 },
    }).document;
    expect(
      refuse(minimal, "output-mask.point.nudge", {
        outputMaskId: "om_x",
        index: 0,
        by: { x: 0, y: 0 },
      }),
    ).toContain("Output Mask “om_x” does not exist");
  });
});

describe("calibration on an Output", () => {
  it("calibrates an Output alone, with every Surface on it, and nothing of a Surface", () => {
    const entered = run(stage(), "calibration.set", calibration);
    expect(entered.document.operational.calibration).toMatchObject({
      surfaceId: null,
      outputId: "out_a",
      outputMaskId: null,
    });
    expect(resolveCalibration(entered.document)).toMatchObject({
      surface: undefined,
      outputId: "out_a",
      outputMask: undefined,
      point: undefined,
    });
    expect(
      run(entered.document, "calibration.set", calibration).patches,
    ).toEqual([]);
    expect(
      refuse(stage(), "calibration.set", {
        ...calibration,
        outputId: undefined,
      }),
    ).toContain("needs its outputId");
    expect(
      refuse(stage(), "calibration.set", { ...calibration, outputId: "out_x" }),
    ).toContain("does not exist");
    expect(
      refuse(stage(), "calibration.set", { ...calibration, corner: "topLeft" }),
    ).toContain("aligns no Mask, Path, Region or corner");
    expect(
      refuse(stage(), "calibration.set", { ...calibration, point: 0 }),
    ).toContain("no point to highlight");
  });

  it("calibrates one Output Mask of the Output with a clamped point", () => {
    const document = run(stage(), "output-mask.create", {
      id: "om_a",
      outputId: "out_a",
      name: "Window",
    }).document;
    const entered = run(document, "calibration.set", {
      ...calibration,
      outputMaskId: "om_a",
      point: 3,
    });
    expect(resolveCalibration(entered.document)).toMatchObject({
      surface: undefined,
      outputMask: { id: "om_a" },
      point: 3,
    });
    expect(
      refuse(document, "calibration.set", {
        ...calibration,
        outputMaskId: "om_a",
        point: 4,
      }),
    ).toContain("has no point 4");
    expect(
      refuse(document, "calibration.set", {
        ...calibration,
        outputId: "out_b",
        outputMaskId: "om_a",
      }),
    ).toContain("is not an Output Mask of “Right”");
    expect(
      refuse(document, "calibration.set", {
        ...calibration,
        surfaceId: "sur_a",
        outputMaskId: "om_a",
      }),
    ).toContain("with no Surface");
    // A point past the end after a removal clamps; a removed mask or Output resolves to none.
    const shorter = run(entered.document, "output-mask.point.remove", {
      outputMaskId: "om_a",
      index: 0,
    }).document;
    expect(resolveCalibration(shorter)?.point).toBe(2);
    const removedMask = run(entered.document, "output-mask.remove", {
      outputMaskId: "om_a",
    }).document;
    expect(resolveCalibration(removedMask)).toBeUndefined();
    const removedOutput = run(entered.document, "output.remove", {
      outputId: "out_a",
    }).document;
    expect(resolveCalibration(removedOutput)).toBeUndefined();
  });

  it("still calibrates a Surface the old way, with the Output Mask field defaulted", () => {
    const entered = run(stage(), "calibration.set", {
      surfaceId: "sur_b",
      maskId: null,
      pathId: null,
      corner: "topLeft",
      point: null,
      view: "selected",
      owner: "session_1",
    });
    expect(entered.document.operational.calibration).toMatchObject({
      surfaceId: "sur_b",
      outputId: "out_a",
      outputMaskId: null,
    });
    expect(resolveCalibration(entered.document)?.surface?.id).toBe("sur_b");
  });
});
