import {
  CORNERS,
  orderedEntries,
  resolveCalibration,
  type CornerName,
  type Document,
  type Mask,
  type Quad,
  type Surface,
} from "@difracta/core";

export type SurfaceStyle = "fill" | "pattern" | "outline";

/** One Surface's appearance on the Output this frame. */
export interface SurfaceDraw {
  readonly surface: Surface;
  readonly corners: Quad;
  readonly style: SurfaceStyle;
  /** The Surface being calibrated: brighter, labelled, with its selected corner. */
  readonly highlighted: boolean;
  /** Masks of this Surface, in order, when they cut the draw; empty otherwise. */
  readonly masks: readonly Mask[];
  readonly corner: CornerName | undefined;
  /** The Mask being aligned, drawn as an outline with its points. */
  readonly maskOutline:
    { readonly mask: Mask; readonly point: number | undefined } | undefined;
}

export interface FramePlan {
  readonly blackout: boolean;
  readonly draws: readonly SurfaceDraw[];
}

/**
 * What one Output shows for a document: nothing under Blackout; otherwise
 * each assigned Surface as a dim fill cut by its Masks, or, in Calibration
 * Mode on this Output, the calibrated Surface as a pattern and the others as
 * the view says. Pure, so the rules are testable without a GPU.
 */
export function planFrame(document: Document, outputId: string): FramePlan {
  if (document.operational.blackout) return { blackout: true, draws: [] };
  const masksOf = (surface: Surface): readonly Mask[] =>
    orderedEntries(document.masks).filter(
      (mask) => mask.surfaceId === surface.id,
    );
  const calibration = resolveCalibration(document);
  const calibrating =
    calibration?.outputId === outputId ? calibration : undefined;
  const draws: SurfaceDraw[] = [];
  for (const surface of orderedEntries(document.surfaces)) {
    if (surface.output !== outputId) continue;
    const corners = surface.mappings[outputId]?.corners;
    if (corners === undefined) continue;
    if (calibrating === undefined) {
      draws.push({
        surface,
        corners,
        style: "fill",
        highlighted: false,
        masks: masksOf(surface),
        corner: undefined,
        maskOutline: undefined,
      });
      continue;
    }
    if (surface.id === calibrating.surface.id) {
      const mask = calibrating.mask;
      draws.push({
        surface,
        corners,
        style: "pattern",
        highlighted: true,
        // A Mask hides the corners being dragged, so it only applies while
        // the Mask itself is aligned, against the shape the audience sees.
        masks: mask === undefined ? [] : masksOf(surface),
        corner:
          mask === undefined
            ? (calibrating.calibration.corner ?? undefined)
            : undefined,
        maskOutline:
          mask === undefined ? undefined : { mask, point: calibrating.point },
      });
      continue;
    }
    const view = calibrating.calibration.view;
    if (view === "selected") continue;
    draws.push({
      surface,
      corners,
      style: view === "outlines" ? "outline" : "pattern",
      highlighted: false,
      masks: [],
      corner: undefined,
      maskOutline: undefined,
    });
  }
  return { blackout: false, draws };
}

export const CORNER_INDEX: Readonly<Record<CornerName, number>> =
  Object.fromEntries(CORNERS.map((corner, index) => [corner, index])) as Record<
    CornerName,
    number
  >;
