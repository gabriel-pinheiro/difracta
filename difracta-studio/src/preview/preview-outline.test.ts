import type { Document } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { previewOutline } from "./preview-outline";
import type { PreviewTarget } from "./preview-target";

const corners = {
  topLeft: { x: 0.2, y: 0.1 },
  topRight: { x: 0.6, y: 0.1 },
  bottomRight: { x: 0.6, y: 0.9 },
  bottomLeft: { x: 0.2, y: 0.9 },
};
const folded = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 1 },
  bottomRight: { x: 1, y: 0 },
  bottomLeft: { x: 0, y: 1 },
};
const document = {
  surfaces: {
    wall: {
      id: "wall",
      mappings: {
        a: { enabled: true, corners },
        b: { enabled: false, corners },
        c: { enabled: true, corners: folded },
      },
    },
  },
  regions: {
    window: {
      id: "window",
      surfaceId: "wall",
      bounds: { topLeft: { x: 0.5, y: 0 }, bottomRight: { x: 1, y: 0.5 } },
    },
  },
} as unknown as Pick<Document, "surfaces" | "regions">;

const output = (outputId: string): PreviewTarget => ({
  framing: "output",
  outputId,
  sceneId: null,
});
const flat = (surfaceId: string): PreviewTarget => ({
  framing: "surface",
  surfaceId,
  quadOutputId: null,
  sceneId: null,
});

describe("previewOutline", () => {
  it("is a Surface's mapping on the Output shown", () => {
    expect(
      previewOutline({
        document,
        target: output("a"),
        selection: { kind: "surface", id: "wall" },
      }),
    ).toEqual([
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ]);
  });

  it("is a Region's bounds on the Surface shown flat", () => {
    expect(
      previewOutline({
        document,
        target: flat("wall"),
        selection: { kind: "region", id: "window" },
      }),
    ).toEqual([
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("is a Region's bounds through its Surface's mapping on an Output", () => {
    const outline = previewOutline({
      document,
      target: output("a"),
      selection: { kind: "region", id: "window" },
    });
    const expected = [
      { x: 0.4, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.5 },
      { x: 0.4, y: 0.5 },
    ];
    expect(outline).toHaveLength(4);
    outline?.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? NaN);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? NaN);
    });
  });

  it("is nothing where the selection does not show", () => {
    const nothing = [
      { target: output("b"), selection: { kind: "surface", id: "wall" } },
      { target: output("c"), selection: { kind: "region", id: "window" } },
      { target: output("a"), selection: { kind: "layer", id: "glow" } },
      { target: output("a"), selection: { kind: "surface", id: "gone" } },
      { target: flat("wall"), selection: { kind: "surface", id: "wall" } },
      { target: flat("floor"), selection: { kind: "region", id: "window" } },
      { target: output("a"), selection: undefined },
    ] as const;
    for (const { target, selection } of nothing)
      expect(previewOutline({ document, target, selection })).toBeUndefined();
  });
});
