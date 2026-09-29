import { describe, expect, it } from "vitest";

import { DEFAULT_CHOICE, type PreviewChoice } from "./preview-choice";
import { resolvePreview, type PreviewTables } from "./preview-target";

const tables = {
  installation: { id: "show", activeScene: "intro" },
  scenes: { intro: { id: "intro" }, finale: { id: "finale" } },
  outputs: {
    a: { id: "a", name: "a", order: "a0" },
    b: { id: "b", name: "b", order: "a1" },
  },
  surfaces: {
    wall: { id: "wall", name: "wall", mappings: { a: { enabled: true } } },
  },
  regions: {
    window: {
      id: "window",
      surfaceId: "wall",
      bounds: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    },
  },
  masks: {},
  paths: {},
  layers: {
    glow: { id: "glow", kind: "visual", target: "window", sceneId: "intro" },
    lost: { id: "lost", kind: "visual", target: null, sceneId: "intro" },
    blur: { id: "blur", kind: "filter", sceneId: "intro" },
    pack: { id: "pack", kind: "group", sceneId: "intro" },
    spark: { id: "spark", kind: "visual", target: "wall", sceneId: "finale" },
  },
} as unknown as PreviewTables;

const layerChoice = (
  outputId: string | null,
  layerId: string | null = null,
): PreviewChoice => ({
  ...DEFAULT_CHOICE,
  outputId,
  framing: "layer",
  layerId,
});
const none = (): undefined => undefined;
type Selected = Parameters<typeof resolvePreview>[0]["selection"];

const resolve = (
  selection: Selected,
  choice = layerChoice("b"),
  sceneId: string | null = null,
) =>
  resolvePreview({
    document: tables,
    choice,
    sceneId,
    selection,
    picked: none,
  });

const onWall = (layerId: string, sceneId: string | null = null) => ({
  framing: "layer",
  layerId,
  on: { framing: "surface", surfaceId: "wall", quadOutputId: "a", sceneId },
});
const onOutput = (layerId: string, outputId = "b") => ({
  framing: "layer",
  layerId,
  on: { framing: "output", outputId, sceneId: null },
});

describe("resolvePreview in Layer framing", () => {
  it("shows a Visual Layer on its Target's Surface flat, a Region's too", () => {
    expect(resolve({ kind: "layer", id: "glow" }).target).toEqual(
      onWall("glow"),
    );
  });

  it("shows a Filter Layer or a Group on the Output shown", () => {
    expect(resolve({ kind: "layer", id: "blur" }).target).toEqual(
      onOutput("blur"),
    );
    expect(resolve({ kind: "layer", id: "pack" }).target).toEqual(
      onOutput("pack"),
    );
    expect(
      resolve({ kind: "layer", id: "pack" }, layerChoice(null)).target,
    ).toEqual(onOutput("pack", "a"));
  });

  it("shows a Layer's Scene, playing or not", () => {
    expect(resolve({ kind: "layer", id: "spark" }).target).toEqual(
      onWall("spark", "finale"),
    );
  });

  it("does not move for a Visual Layer without a Target", () => {
    expect(resolve({ kind: "layer", id: "lost" }).target).toEqual({
      framing: "output",
      outputId: "b",
      sceneId: null,
    });
  });

  it("stays on the Layer shown for a selection that does not move it", () => {
    expect(
      resolve({ kind: "macro", id: "hit" }, layerChoice("b", "blur")).target,
    ).toEqual(onOutput("blur"));
    expect(
      resolve({ kind: "macro", id: "hit" }, layerChoice("b", "spark"), "finale")
        .target,
    ).toEqual(onWall("spark", "finale"));
  });

  it("leaves the Layer for a Scene, another Scene playing or a Layer gone", () => {
    const output = (sceneId: string | null) => ({
      framing: "output",
      outputId: "b",
      sceneId,
    });
    expect(
      resolve({ kind: "scene", id: "intro" }, layerChoice("b", "blur")).target,
    ).toEqual(output(null));
    expect(
      resolve({ kind: "macro", id: "hit" }, layerChoice("b", "spark")).target,
    ).toEqual(output(null));
    expect(
      resolve({ kind: "macro", id: "hit" }, layerChoice("b", "gone")).target,
    ).toEqual(output(null));
  });

  it("frames everything else as Surface framing does", () => {
    expect(resolve({ kind: "region", id: "window" }).target).toEqual({
      framing: "surface",
      surfaceId: "wall",
      quadOutputId: "a",
      sceneId: null,
    });
    expect(resolve({ kind: "output", id: "a" }).target).toEqual({
      framing: "output",
      outputId: "a",
      sceneId: null,
    });
  });
});
