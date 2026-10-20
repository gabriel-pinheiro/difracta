import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import {
  fromFrame,
  outputSlices,
  projectionFrame,
} from "../document/slices.ts";
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

/** Output LED with a 300×100 Display Frame. */
function led(): Document {
  let document = run(emptyDocument("Stage"), "output.create", {
    id: "out_a",
    name: "LED",
  });
  document = run(document, "output.update", {
    outputId: "out_a",
    displaySize: { width: 300, height: 100 },
  });
  return document;
}

/** LED split into three 100×100 Slices, Left, Center and Right, in place. */
function three(): Document {
  let document = run(led(), "slice.create", {
    id: "sl_a",
    outputId: "out_a",
    name: "Panel",
  });
  document = run(document, "slice.split", {
    sliceId: "sl_a",
    columns: 3,
    rows: 1,
  });
  return document;
}

function pieces(document: Document) {
  return outputSlices(document.slices, "out_a");
}

describe("slice.create", () => {
  it("is refused while the Output has no Display size", () => {
    const document = run(emptyDocument("Stage"), "output.create", {
      id: "out_a",
      name: "LED",
    });
    expect(
      refuse(document, "slice.create", { outputId: "out_a", name: "Panel" }),
    ).toMatch(/no Display size/);
  });

  it("makes the first Slice cover the Display Frame, placed where it sits", () => {
    const document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Panel",
    });
    expect(document.slices.sl_a).toEqual({
      id: "sl_a",
      name: "Panel",
      outputId: "out_a",
      rect: { x: 0, y: 0, width: 300, height: 100 },
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
      order: "a0",
    });
    // Full: the next one takes the top-left quarter, overlapping, and sits
    // on stage just right of the first.
    const more = run(document, "slice.create", {
      id: "sl_b",
      outputId: "out_a",
      name: "More",
    });
    expect(more.slices.sl_b).toMatchObject({
      rect: { x: 0, y: 0, width: 150, height: 50 },
      position: { x: 300, y: 0 },
    });
  });

  it("fills the remaining space when it is a rectangle, the largest free one otherwise", () => {
    let document = run(led(), "slice.create", {
      outputId: "out_a",
      name: "Left",
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    document = run(document, "slice.create", {
      id: "sl_r",
      outputId: "out_a",
      name: "Right",
    });
    expect(document.slices.sl_r).toMatchObject({
      rect: { x: 100, y: 0, width: 200, height: 100 },
      position: { x: 100, y: 0 },
    });
    let ell = run(led(), "slice.create", {
      outputId: "out_a",
      name: "Corner",
      rect: { x: 0, y: 0, width: 200, height: 40 },
    });
    ell = run(ell, "slice.create", {
      id: "sl_c",
      outputId: "out_a",
      name: "Next",
    });
    // Free space is an L: 100×100 on the right, 200×60 below; the latter wins.
    expect(ell.slices.sl_c?.rect).toEqual({
      x: 0,
      y: 40,
      width: 300,
      height: 60,
    });
  });

  it("allows Display overlap and refuses a rect past the Display Frame on any side", () => {
    const document = run(led(), "slice.create", {
      outputId: "out_a",
      name: "Left",
      rect: { x: 0, y: 0, width: 150, height: 100 },
    });
    const overlapping = run(document, "slice.create", {
      outputId: "out_a",
      name: "Right",
      rect: { x: 149, y: 0, width: 151, height: 100 },
    });
    expect(pieces(overlapping)).toHaveLength(2);
    expect(
      refuse(document, "slice.create", {
        outputId: "out_a",
        name: "Wide",
        rect: { x: 200, y: 0, width: 101, height: 100 },
      }),
    ).toBe("Slice “Wide” would reach past the 300×100 Display Frame.");
  });
});

describe("slice.nudge and Display edges", () => {
  it("stops a rect at the Display Frame's edges", () => {
    const document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Panel",
      rect: { x: 10, y: 10, width: 100, height: 50 },
    });
    const left = run(document, "slice.nudge", {
      sliceId: "sl_a",
      of: "rect",
      dx: -50,
      dy: -50,
    });
    expect(left.slices.sl_a?.rect).toMatchObject({ x: 0, y: 0 });
    const right = run(document, "slice.nudge", {
      sliceId: "sl_a",
      of: "rect",
      dx: 500,
      dy: 500,
    });
    expect(right.slices.sl_a?.rect).toMatchObject({ x: 200, y: 50 });
  });

  it("lets a Slice left past the edge by a smaller Display size be edited back in", () => {
    let document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Panel",
    });
    document = run(document, "output.update", {
      outputId: "out_a",
      displaySize: { width: 200, height: 100 },
    });
    const nudged = run(document, "slice.nudge", {
      sliceId: "sl_a",
      of: "rect",
      dx: 0,
      dy: 0,
    });
    expect(nudged.slices.sl_a?.rect.width).toBe(300);
    const shrunk = run(document, "slice.update", {
      sliceId: "sl_a",
      rect: { x: 0, y: 0, width: 250, height: 100 },
    });
    expect(shrunk.slices.sl_a?.rect.width).toBe(250);
  });
});

describe("slice.split", () => {
  it("tiles the rect and keeps the first piece's id", () => {
    const document = three();
    expect(
      pieces(document).map((slice) => [
        slice.id === "sl_a",
        slice.name,
        slice.rect,
      ]),
    ).toEqual([
      [true, "Panel 1", { x: 0, y: 0, width: 100, height: 100 }],
      [false, "Panel 2", { x: 100, y: 0, width: 100, height: 100 }],
      [false, "Panel 3", { x: 200, y: 0, width: 100, height: 100 }],
    ]);
  });

  it.each([
    [0, [0, 100, 200]],
    [90, [0, 0, 0]],
    [180, [200, 100, 0]],
    [270, [0, 0, 0]],
  ] as const)("places each piece where its part sat at %i°", (rotation, xs) => {
    let document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Strip",
    });
    document = run(document, "slice.update", { sliceId: "sl_a", rotation });
    const before = projectionFrame(document.outputs.out_a!, pieces(document));
    document = run(document, "slice.split", {
      sliceId: "sl_a",
      columns: 3,
      rows: 1,
    });
    expect(pieces(document).map((slice) => slice.position.x)).toEqual(xs);
    const ys = pieces(document).map((slice) => slice.position.y);
    expect(ys).toEqual(
      rotation === 90
        ? [0, 100, 200]
        : rotation === 270
          ? [200, 100, 0]
          : [0, 0, 0],
    );
    expect(projectionFrame(document.outputs.out_a!, pieces(document))).toEqual(
      before,
    );
  });

  it("moves followers to the first piece", () => {
    let document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Panel",
    });
    document = run(document, "surface.create", { id: "sur_a", name: "Wall" });
    document = run(document, "surface.follow", {
      surfaceId: "sur_a",
      follow: "sl_a",
    });
    document = run(document, "slice.split", {
      sliceId: "sl_a",
      columns: 3,
      rows: 1,
    });
    expect(document.surfaces.sur_a!.mappings.out_a!.follow).toEqual({
      slice: "sl_a",
    });
    expect(document.slices.sl_a!.rect.width).toBe(100);
  });
});

describe("re-anchoring", () => {
  it("keeps free corners and Output Mask points on their Projection pixel when a Slice moves past an edge", () => {
    let document = three();
    document = run(document, "surface.create", { id: "sur_a", name: "Wall" });
    document = run(document, "surface.follow", {
      surfaceId: "sur_a",
      follow: null,
    });
    document = run(document, "surface.create", { id: "sur_b", name: "Stage" });
    document = run(document, "output-mask.create", {
      id: "om_a",
      outputId: "out_a",
      name: "Truss",
    });
    const pixels = (doc: Document) => {
      const frame = projectionFrame(doc.outputs.out_a!, pieces(doc))!;
      return {
        corner: fromFrame(
          doc.surfaces.sur_a!.mappings.out_a!.corners.topRight,
          frame,
        ),
        point: fromFrame(doc.outputMasks.om_a!.points[2]!, frame),
      };
    };
    const before = pixels(document);
    const [, , right] = pieces(document);
    const moved = run(document, "slice.update", {
      sliceId: right!.id,
      position: { x: 500, y: -50 },
    });
    expect(projectionFrame(moved.outputs.out_a!, pieces(moved))).toEqual({
      x: 0,
      y: -50,
      width: 600,
      height: 150,
    });
    const after = pixels(moved);
    expect(after.corner.x).toBeCloseTo(before.corner.x, 3);
    expect(after.corner.y).toBeCloseTo(before.corner.y, 3);
    expect(after.point.x).toBeCloseTo(before.point.x, 3);
    expect(after.point.y).toBeCloseTo(before.point.y, 3);
    // The Stage Surface follows the frame and is left alone.
    expect(moved.surfaces.sur_b).toBe(document.surfaces.sur_b);
  });

  it("is one undo step with the Slice change", () => {
    let document = three();
    document = run(document, "surface.create", { id: "sur_a", name: "Wall" });
    document = run(document, "surface.follow", {
      surfaceId: "sur_a",
      follow: null,
    });
    const result = executeCommand(registry, document, "slice.nudge", {
      sliceId: "sl_a",
      of: "position",
      dx: -10,
      dy: 0,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.patches.map((patch) => patch.path[0])).toEqual([
      "slices",
      "surfaces",
    ]);
  });
});

describe("slice.remove", () => {
  it("unlinks followers of the Slice where they were", () => {
    let document = three();
    const [, center] = pieces(document);
    document = run(document, "surface.create", { id: "sur_a", name: "Logo" });
    document = run(document, "surface.follow", {
      surfaceId: "sur_a",
      follow: center!.id,
    });
    const removed = run(document, "slice.remove", { sliceId: center!.id });
    const mapping = removed.surfaces.sur_a!.mappings.out_a!;
    expect(mapping.follow).toBeUndefined();
    // The frame keeps its bounds (Left and Right remain), so Center's place stands.
    expect(mapping.corners.topLeft.x).toBeCloseTo(1 / 3, 5);
    expect(mapping.corners.bottomRight).toEqual({ x: 0.666667, y: 1 });
  });

  it("unlinks whole-frame followers with the last Slice", () => {
    let document = run(led(), "slice.create", {
      id: "sl_a",
      outputId: "out_a",
      name: "Panel",
    });
    document = run(document, "surface.create", { id: "sur_a", name: "Stage" });
    expect(document.surfaces.sur_a!.mappings.out_a!.follow).toEqual({
      frame: true,
    });
    const removed = run(document, "slice.remove", { sliceId: "sl_a" });
    expect(removed.surfaces.sur_a!.mappings.out_a).toEqual({
      enabled: true,
      corners: {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0, y: 1 },
      },
    });
  });
});

describe("slice.rename and output.remove", () => {
  it("keeps names unique per Output and removes Slices with their Output", () => {
    const document = three();
    const [first, second] = pieces(document);
    expect(
      run(document, "slice.rename", { sliceId: second!.id, name: "Panel 1" })
        .slices[second!.id]!.name,
    ).toBe("Panel 2");
    expect(first!.name).toBe("Panel 1");
    expect(
      Object.keys(run(document, "output.remove", { outputId: "out_a" }).slices),
    ).toEqual([]);
  });

  it("refuses forgetting the Display size while Slices need it", () => {
    expect(
      refuse(three(), "output.update", {
        outputId: "out_a",
        displaySize: null,
      }),
    ).toMatch(/need its Display size/);
    expect(orderedEntries(three().slices)).toHaveLength(3);
  });
});
