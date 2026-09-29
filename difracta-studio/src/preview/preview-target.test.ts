import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHOICE,
  type Framing,
  type PreviewChoice,
} from "./preview-choice";
import {
  framedOn,
  resolvePreview as resolve,
  type PreviewTables,
} from "./preview-target";

const resolvePreview = (
  input: Omit<Parameters<typeof resolve>[0], "sceneId"> & {
    readonly sceneId?: string | null;
  },
) => resolve({ sceneId: null, ...input });

const output = (id: string, order: string) => ({ id, name: id, order });
const surface = (id: string, on: readonly string[]) => ({
  id,
  name: id,
  mappings: Object.fromEntries(
    on.map((outputId) => [outputId, { enabled: true }]),
  ),
});

const tables = {
  installation: { id: "show", activeScene: "intro" },
  scenes: { intro: { id: "intro" }, finale: { id: "finale" } },
  outputs: { a: output("a", "a0"), b: output("b", "a1") },
  surfaces: {
    wall: surface("wall", ["a"]),
    floor: surface("floor", ["a", "b"]),
    attic: surface("attic", []),
  },
  regions: {
    window: {
      id: "window",
      surfaceId: "wall",
      bounds: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    },
  },
  masks: { door: { id: "door", surfaceId: "floor" } },
  paths: { edge: { id: "edge", surfaceId: "wall" } },
  layers: {
    glow: { id: "glow", kind: "visual", target: "window", sceneId: "intro" },
    lost: { id: "lost", kind: "visual", target: null, sceneId: "intro" },
    blur: { id: "blur", kind: "filter", sceneId: "intro" },
    spark: { id: "spark", kind: "visual", target: "floor", sceneId: "finale" },
    haze: { id: "haze", kind: "filter", sceneId: "finale" },
  },
} as unknown as PreviewTables;

const follow = (
  outputId: string | null,
  framing: Framing = "output",
  surfaceId: string | null = null,
): PreviewChoice => ({
  ...DEFAULT_CHOICE,
  outputId,
  framing,
  surfaceId,
});
const none = (): undefined => undefined;
const shows = (outputId: string) => ({
  target: { framing: "output", outputId, sceneId: null },
  notice: undefined,
});
const flat = (
  surfaceId: string,
  quadOutputId: string | null,
  sceneId: string | null = null,
) => ({
  target: { framing: "surface", surfaceId, quadOutputId, sceneId },
  notice: undefined,
});

describe("resolvePreview", () => {
  it("stays on a named Output whatever is selected", () => {
    expect(
      resolvePreview({
        document: tables,
        choice: { ...follow("b", "surface", "wall"), follow: false },
        sceneId: "finale",
        selection: { kind: "output", id: "a" },
        picked: none,
      }),
    ).toEqual(shows("b"));
  });

  it("starts on the first Output, and again when the one shown is gone", () => {
    for (const outputId of [null, "gone"])
      for (const following of [true, false])
        expect(
          resolvePreview({
            document: tables,
            choice: { ...follow(outputId), follow: following },
            selection: undefined,
            picked: none,
          }),
        ).toEqual(shows("a"));
  });

  it("shows nothing while there is no Output", () => {
    expect(
      resolvePreview({
        document: { ...tables, outputs: {} },
        choice: follow("a"),
        selection: { kind: "surface", id: "wall" },
        picked: none,
      }).target,
    ).toBeUndefined();
  });

  it("follows a selected Output", () => {
    expect(
      resolvePreview({
        document: tables,
        choice: follow("a"),
        selection: { kind: "output", id: "b" },
        picked: none,
      }),
    ).toEqual(shows("b"));
  });

  it("follows a Surface, and what belongs to one, to its only Output", () => {
    const selections = [
      { kind: "surface", id: "wall" },
      { kind: "region", id: "window" },
      { kind: "path", id: "edge" },
      { kind: "layer", id: "glow" },
    ] as const;
    for (const selection of selections)
      expect(
        resolvePreview({
          document: tables,
          choice: follow("b"),
          selection,
          picked: none,
        }),
      ).toEqual(shows("a"));
  });

  it("stays on the Output shown when the Surface is on it too", () => {
    expect(
      resolvePreview({
        document: tables,
        choice: follow("b"),
        selection: { kind: "mask", id: "door" },
        picked: () => "a",
      }),
    ).toEqual(shows("b"));
  });

  it("moves to the Output picked for the Surface otherwise", () => {
    const document = {
      ...tables,
      outputs: { ...tables.outputs, c: output("c", "a2") },
    } as unknown as PreviewTables;
    const resolve = (picked: string | undefined) =>
      resolvePreview({
        document,
        choice: follow("c"),
        selection: { kind: "surface", id: "floor" },
        picked: () => picked,
      });
    expect(resolve("b")).toEqual(shows("b"));
    expect(resolve("c")).toEqual({
      target: { framing: "output", outputId: "c", sceneId: null },
      notice: {
        kind: "several",
        surfaceName: "floor",
        outputs: [
          { id: "a", name: "a" },
          { id: "b", name: "b" },
        ],
      },
    });
  });

  it("says so when the Surface is on no Output", () => {
    expect(
      resolvePreview({
        document: tables,
        choice: follow("b"),
        selection: { kind: "surface", id: "attic" },
        picked: none,
      }),
    ).toEqual({
      target: { framing: "output", outputId: "b", sceneId: null },
      notice: { kind: "unmapped", surfaceName: "attic" },
    });
  });

  it("does not move for a selection that names no Surface", () => {
    const selections = [
      undefined,
      { kind: "installation" },
      { kind: "layer", id: "lost" },
      { kind: "layer", id: "blur" },
      { kind: "scene", id: "intro" },
      { kind: "scene", id: "gone" },
      { kind: "macro", id: "hit" },
      { kind: "surface", id: "gone" },
    ] as const;
    for (const selection of selections)
      expect(
        resolvePreview({
          document: tables,
          choice: follow("b"),
          selection,
          picked: none,
        }),
      ).toEqual(shows("b"));
  });

  it("shows a Surface flat when the framing allows, on any Output or none", () => {
    for (const framing of ["surface", "layer"] as const) {
      const at = (selection: Parameters<typeof resolve>[0]["selection"]) =>
        resolvePreview({
          document: tables,
          choice: follow("b", framing),
          selection,
          picked: none,
        });
      expect(at({ kind: "surface", id: "wall" })).toEqual(flat("wall", "a"));
      expect(at({ kind: "region", id: "window" })).toEqual(flat("wall", "a"));
      if (framing === "surface")
        expect(at({ kind: "layer", id: "glow" })).toEqual(flat("wall", "a"));
      expect(at({ kind: "mask", id: "door" })).toEqual(flat("floor", "b"));
      expect(at({ kind: "surface", id: "attic" })).toEqual(flat("attic", null));
      expect(at({ kind: "output", id: "a" })).toEqual(shows("a"));
    }
  });

  it("shows a Surface flat with no Output at all", () => {
    expect(
      resolvePreview({
        document: { ...tables, outputs: {} },
        choice: follow(null, "surface"),
        selection: { kind: "surface", id: "wall" },
        picked: none,
      }),
    ).toEqual(flat("wall", null));
  });

  it("stays on the Surface shown flat, until the framing is Output", () => {
    const at = (framing: Framing, surfaceId: string | null) =>
      resolvePreview({
        document: tables,
        choice: follow("b", framing, surfaceId),
        selection: { kind: "macro", id: "hit" },
        picked: none,
      });
    expect(at("surface", "wall")).toEqual(flat("wall", "a"));
    expect(at("surface", null)).toEqual(shows("b"));
    expect(at("surface", "gone")).toEqual(shows("b"));
    expect(at("output", "wall")).toEqual(shows("b"));
  });

  it("shows the Scene selected, or the selected Layer's, playing or not", () => {
    const at = (
      selection: Parameters<typeof resolve>[0]["selection"],
      framing: Framing = "output",
    ) =>
      resolvePreview({
        document: tables,
        choice: follow("b", framing, "wall"),
        selection,
        picked: none,
      }).target;
    expect(at({ kind: "scene", id: "finale" })).toEqual({
      framing: "output",
      outputId: "b",
      sceneId: "finale",
    });
    expect(at({ kind: "scene", id: "finale" }, "surface")).toEqual(
      flat("wall", "a", "finale").target,
    );
    const scene = (target: ReturnType<typeof at>) =>
      target === undefined ? undefined : framedOn(target).sceneId;
    expect(scene(at({ kind: "layer", id: "haze" }))).toBe("finale");
    expect(at({ kind: "layer", id: "spark" }, "surface")).toEqual(
      flat("floor", "b", "finale").target,
    );
    expect(scene(at({ kind: "layer", id: "spark" }, "layer"))).toBe("finale");
    expect(scene(at({ kind: "layer", id: "glow" }))).toBeNull();
  });

  it("keeps the Scene shown until another is selected or it plays", () => {
    const at = (
      selection: Parameters<typeof resolve>[0]["selection"],
      document: PreviewTables = tables,
    ) => {
      const { target } = resolvePreview({
        document,
        choice: follow("b"),
        sceneId: "finale",
        selection,
        picked: none,
      });
      return target === undefined ? undefined : framedOn(target).sceneId;
    };
    expect(at({ kind: "macro", id: "hit" })).toBe("finale");
    expect(at({ kind: "surface", id: "wall" })).toBe("finale");
    expect(at({ kind: "scene", id: "intro" })).toBeNull();
    expect(
      at(
        { kind: "macro", id: "hit" },
        {
          ...tables,
          installation: { ...tables.installation, activeScene: "finale" },
        },
      ),
    ).toBeNull();
    expect(
      at(
        { kind: "macro", id: "hit" },
        {
          ...tables,
          scenes: {},
        },
      ),
    ).toBeNull();
  });
});
