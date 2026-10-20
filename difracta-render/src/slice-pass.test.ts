import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { planFrame } from "./plan.ts";
import { slicedFrame, sliceVertices } from "./slice-pass.ts";

const solid: VisualDefinition = {
  kind: "visual",
  id: "solid",
  name: "Solid",
  description: "One color.",
  backend: "canvas",
  parameters: {},
};
const catalog = new Catalog({ visuals: [solid], filters: [] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/**
 * LED, a 300×100 input packing three 100×100 panels: Left in place, Center
 * placed at 300 on stage, Right turned 90° and doubled at 600.
 */
function led(): Document {
  let document = emptyDocument("Stage");
  document = run(document, "output.create", { id: "out_a", name: "LED" });
  document = run(document, "output.update", {
    outputId: "out_a",
    displaySize: { width: 300, height: 100 },
  });
  for (const [id, x, position, rotation, scale] of [
    ["sl_l", 0, { x: 0, y: 0 }, 0, 1],
    ["sl_c", 100, { x: 300, y: 0 }, 0, 1],
    ["sl_r", 200, { x: 600, y: 0 }, 90, 2],
  ] as const)
    document = run(document, "slice.create", {
      id,
      outputId: "out_a",
      name: id,
      rect: { x, y: 0, width: 100, height: 100 },
      position,
      rotation,
      scale,
    });
  return document;
}

describe("slicedFrame", () => {
  it("is undefined without Slices and sizes the offscreen frame to the Projection Frame", () => {
    let unsliced = emptyDocument("Stage");
    unsliced = run(unsliced, "output.create", { id: "out_a", name: "LED" });
    expect(slicedFrame(unsliced, "out_a", 8192)).toBeUndefined();
    const sliced = slicedFrame(led(), "out_a", 8192);
    expect(sliced).toMatchObject({
      frame: { x: 0, y: 0, width: 800, height: 200 },
      width: 800,
      height: 200,
      capped: false,
      display: { width: 300, height: 100 },
    });
  });

  it("caps at the GPU's texture limit, scaling both sides alike", () => {
    expect(slicedFrame(led(), "out_a", 400)).toMatchObject({
      width: 400,
      height: 100,
      capped: true,
    });
  });
});

describe("sliceVertices", () => {
  function corners(data: Float32Array, slice: number) {
    // Triangle order TL, TR, BR, TL, BR, BL: vertices 0, 1, 2 and 5.
    const at = (vertex: number) => {
      const offset = (slice * 6 + vertex) * 4;
      return Array.from(data.slice(offset, offset + 4));
    };
    return { tl: at(0), tr: at(1), br: at(2), bl: at(5) };
  }

  it("puts each Display rectangle in the canvas and samples where it was placed", () => {
    const sliced = slicedFrame(led(), "out_a", 8192)!;
    const data = sliceVertices(sliced, 300, 100);
    // Center: Display 100..200 on the canvas, stage 300..400 of 800.
    expect(corners(data, 1).tl).toEqual([
      expect.closeTo(-1 / 3),
      1,
      expect.closeTo(0.375),
      1,
    ]);
    expect(corners(data, 1).br).toEqual([
      expect.closeTo(1 / 3),
      -1,
      expect.closeTo(0.5),
      expect.closeTo(0.5),
    ]);
    // Right is turned 90°: its Display top-left samples the placed top-right.
    const right = corners(data, 2);
    expect(right.tl.slice(2)).toEqual([1, 1]);
    expect(right.bl.slice(2)).toEqual([0.75, 1]);
  });

  it("fits the Display Frame top-left at one scale", () => {
    const sliced = slicedFrame(led(), "out_a", 8192)!;
    // A canvas twice as tall: exact on width, the extra rows below.
    const tall = corners(sliceVertices(sliced, 300, 200), 0);
    expect(tall.bl.slice(0, 2)).toEqual([-1, 0]);
    // A canvas half as wide: the whole map, at half size.
    const small = corners(sliceVertices(sliced, 150, 100), 2);
    expect(small.br.slice(0, 2)).toEqual([1, 0]);
  });
});

describe("planFrame on an Output with Slices", () => {
  it("lands a following Surface on its Slice's placed rectangle", () => {
    let document = run(led(), "surface.create", { id: "sur_a", name: "Logo" });
    document = run(document, "surface.follow", {
      surfaceId: "sur_a",
      follow: "sl_c",
    });
    document = run(document, "scene.create", { id: "sc_a", name: "Live" });
    document = run(document, "layer.create", {
      id: "lay_a",
      sceneId: "sc_a",
      kind: "visual",
      name: "Fill",
    });
    document = run(document, "layer.visual", {
      layerId: "lay_a",
      visual: "solid",
    });
    document = run(document, "layer.update", {
      layerId: "lay_a",
      target: "sur_a",
    });
    document = run(document, "scene.play", { sceneId: "sc_a" });
    const [draw] = planFrame(document, "out_a", catalog).layers;
    expect(draw?.corners).toEqual({
      topLeft: { x: 0.375, y: 0 },
      topRight: { x: 0.5, y: 0 },
      bottomRight: { x: 0.5, y: 0.5 },
      bottomLeft: { x: 0.375, y: 0.5 },
    });
  });

  it("plans the Slice test card in place of the Surfaces, the selected one marked", () => {
    let document = run(led(), "surface.create", { id: "sur_a", name: "Stage" });
    document = run(document, "calibration.set", {
      surfaceId: null,
      outputId: "out_a",
      sliceId: "sl_r",
      maskId: null,
      pathId: null,
      corner: null,
      point: null,
      view: "patterns",
      owner: "session_1",
    });
    const plan = planFrame(document, "out_a", catalog);
    expect(plan.draws).toEqual([]);
    expect(
      plan.sliceCard.map((tile) => [tile.slice.id, tile.selected, tile.rect]),
    ).toEqual([
      ["sl_l", false, { x: 0, y: 0, width: 0.125, height: 0.5 }],
      ["sl_c", false, { x: 0.375, y: 0, width: 0.125, height: 0.5 }],
      ["sl_r", true, { x: 0.75, y: 0, width: 0.25, height: 1 }],
    ]);
    const patterns = run(document, "calibration.set", {
      surfaceId: null,
      outputId: "out_a",
      maskId: null,
      pathId: null,
      corner: null,
      point: null,
      view: "patterns",
      owner: "session_1",
    });
    expect(planFrame(patterns, "out_a", catalog).sliceCard).toEqual([]);
    expect(planFrame(patterns, "out_a", catalog).draws).toHaveLength(1);
  });
});
