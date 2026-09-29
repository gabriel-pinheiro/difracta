import {
  FULL_FRAME,
  emptyDocument,
  isEnabledOn,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { flatOutputId, previewFrame, previewFrames } from "./preview-document";
import type { PreviewTarget } from "./preview-target";

const target: PreviewTarget = {
  framing: "output",
  outputId: "a",
  sceneId: null,
};
const wall: PreviewTarget = {
  framing: "surface",
  surfaceId: "wall",
  quadOutputId: "a",
  sceneId: null,
};
const lit = emptyDocument("Show");
const dark: Document = {
  ...lit,
  operational: {
    ...lit.operational,
    blackout: true,
    calibration: {
      surfaceId: "wall",
      outputId: "a",
    } as Document["operational"]["calibration"],
  },
};

describe("previewFrame", () => {
  it("renders the document itself on the target's Output", () => {
    const frame = previewFrame(lit, target);
    expect(frame.document).toBe(lit);
    expect(frame.outputId).toBe("a");
  });

  it("lifts Blackout and keeps the rest, Calibration Mode included", () => {
    const { document } = previewFrame(dark, target);
    expect(document.operational.blackout).toBe(false);
    expect(document.operational.calibration).toBe(dark.operational.calibration);
    expect(document.layers).toBe(dark.layers);
    expect(dark.operational.blackout).toBe(true);
  });
});

describe("previewFrame of a Scene", () => {
  const staged = {
    ...lit,
    installation: { ...lit.installation, activeScene: "intro" },
    scenes: { intro: { id: "intro" }, finale: { id: "finale" } },
  } as unknown as Document;

  it("makes the Scene shown the active one, and nothing else", () => {
    const { document } = previewFrame(staged, { ...target, sceneId: "finale" });
    expect(document.installation.activeScene).toBe("finale");
    expect(document.installation.name).toBe(staged.installation.name);
    expect(document.scenes).toBe(staged.scenes);
    expect(staged.installation.activeScene).toBe("intro");
  });

  it("leaves the active Scene for one that is gone", () => {
    expect(previewFrame(staged, { ...target, sceneId: "gone" }).document).toBe(
      staged,
    );
  });
});

describe("previewFrame of a Surface", () => {
  const corners = {
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.4, y: 0.2 },
    bottomRight: { x: 0.4, y: 0.8 },
    bottomLeft: { x: 0.1, y: 0.9 },
  };
  const mapped = {
    ...dark,
    outputs: { a: { id: "a" }, preview: { id: "preview" } },
    surfaces: {
      wall: { id: "wall", mappings: { a: { enabled: true, corners } } },
      floor: {
        id: "floor",
        mappings: {
          a: { enabled: true, corners },
          preview_: { enabled: true, corners },
        },
      },
      attic: { id: "attic", mappings: {} },
    },
  } as unknown as Document;

  it("renders on an Output no Output or mapping is named after", () => {
    expect(flatOutputId(lit)).toBe("preview");
    expect(flatOutputId(mapped)).toBe("preview__");
    expect(previewFrame(mapped, wall).outputId).toBe("preview__");
  });

  it("maps only that Surface there, filling the frame", () => {
    const { document, outputId } = previewFrame(mapped, wall);
    expect(document.surfaces.wall?.mappings[outputId]).toEqual({
      enabled: true,
      corners: FULL_FRAME,
    });
    expect(document.surfaces.wall?.mappings.a).toBe(
      mapped.surfaces.wall?.mappings.a,
    );
    const others = Object.values(document.surfaces).filter((surface) =>
      isEnabledOn(surface, outputId),
    );
    expect(others.map((surface) => surface.id)).toEqual(["wall"]);
    expect(document.surfaces.floor).toBe(mapped.surfaces.floor);
    expect(document.layers).toBe(mapped.layers);
  });

  it("shows a Surface that is on no Output", () => {
    const { document, outputId } = previewFrame(mapped, {
      ...wall,
      surfaceId: "attic",
      quadOutputId: null,
    });
    expect(document.surfaces.attic?.mappings[outputId]?.enabled).toBe(true);
  });

  it("lifts Blackout and keeps Calibration Mode on its own Output", () => {
    const { document, outputId } = previewFrame(mapped, wall);
    expect(document.operational.blackout).toBe(false);
    expect(document.operational.calibration?.outputId).not.toBe(outputId);
  });

  it("keeps the flat Surface while the Surface itself is the same", () => {
    const first = previewFrame(mapped, wall).document.surfaces.wall;
    const later = previewFrame({ ...mapped, layers: {} }, wall);
    expect(later.document.surfaces.wall).toBe(first);
  });

  it("renders nothing of a Surface that is gone", () => {
    const { document } = previewFrame(mapped, { ...wall, surfaceId: "gone" });
    expect(document.surfaces).toBe(mapped.surfaces);
  });
});

describe("previewFrames", () => {
  it("answers with the same copy for the same document and target", () => {
    const frames = previewFrames();
    const first = frames(dark, target);
    expect(frames(dark, { ...target })).toBe(first);
    expect(first.document).toBe(frames(dark, target).document);
  });

  it("makes another for another document or target", () => {
    const frames = previewFrames();
    const first = frames(dark, target);
    expect(frames({ ...dark }, target)).not.toBe(first);
    expect(frames(dark, { ...target, outputId: "b" }).outputId).toBe("b");
    expect(frames(dark, { ...target, sceneId: "finale" })).not.toBe(
      frames(dark, target),
    );
    expect(frames(dark, wall)).not.toBe(frames(dark, target));
    expect(frames(dark, { ...wall, surfaceId: "floor" })).not.toBe(
      frames(dark, wall),
    );
  });

  it("does not tell targets apart by the Output a shape is read from", () => {
    const frames = previewFrames();
    expect(frames(dark, { ...wall, quadOutputId: null })).toBe(
      frames(dark, wall),
    );
  });
});
