import {
  enabledCorners,
  orderedEntries,
  REGION_CORNERS,
  type CornerName,
  type Document,
  type Mask,
  type Region,
  type RegionCorner,
  type ResolvedCalibration,
  type Surface,
} from "@difracta/core";

import type { FramePlan, SurfaceDraw } from "./plan.ts";

/**
 * The Calibration Mode drawings of one Output. With a Surface being
 * aligned: that Surface as a highlighted pattern with its corner, Mask,
 * Path or Region outline, and the Output's other Surfaces as the view
 * says. With none, the Output itself or one of its Output Masks is being
 * aligned: every Surface on the Output as a plain pattern, none
 * highlighted, no corners, no Surface Masks, the view ignored, and the
 * Output Mask's outline over them all.
 */
export function calibrationDraws(
  document: Document,
  outputId: string,
  calibrating: ResolvedCalibration,
  masksOf: (surface: Surface) => readonly Mask[],
): Pick<FramePlan, "draws" | "outputMaskOutline"> {
  const draws: SurfaceDraw[] = [];
  const aligned = calibrating.surface;
  for (const surface of orderedEntries(document.surfaces)) {
    const corners = enabledCorners(surface, outputId);
    if (corners === undefined) continue;
    if (surface.id === aligned?.id) {
      draws.push(alignedDraw(document, surface, corners, calibrating, masksOf));
      continue;
    }
    const view =
      aligned === undefined ? "patterns" : calibrating.calibration.view;
    if (view === "selected") continue;
    draws.push({
      ...PLAIN,
      surface,
      corners,
      style: view === "outlines" ? "outline" : "pattern",
    });
  }
  const { outputMask } = calibrating;
  return {
    draws,
    outputMaskOutline:
      outputMask === undefined
        ? undefined
        : { mask: outputMask, point: calibrating.point },
  };
}

const PLAIN = {
  highlighted: false,
  masks: [],
  corner: undefined,
  maskOutline: undefined,
  pathOutline: undefined,
  regions: [],
} as const;

function alignedDraw(
  document: Document,
  surface: Surface,
  corners: SurfaceDraw["corners"],
  calibrating: ResolvedCalibration,
  masksOf: (surface: Surface) => readonly Mask[],
): SurfaceDraw {
  const { mask, path, region } = calibrating;
  const shape = mask ?? path ?? region;
  const corner = calibrating.calibration.corner ?? undefined;
  return {
    surface,
    corners,
    style: "pattern",
    highlighted: true,
    // A Mask hides the corners being dragged, so Masks only apply while
    // a Mask, Path or Region is aligned, against the shape the audience sees.
    masks: shape === undefined ? [] : masksOf(surface),
    corner: shape === undefined ? corner : undefined,
    maskOutline:
      mask === undefined ? undefined : { mask, point: calibrating.point },
    pathOutline:
      path === undefined ? undefined : { path, point: calibrating.point },
    // Regions follow the quad, so they show while it or one of them is aligned.
    regions:
      mask !== undefined || path !== undefined
        ? []
        : regionsOf(document, surface).map((entry) => ({
            region: entry,
            highlighted: entry.id === region?.id,
            corner:
              entry.id === region?.id && isRegionCorner(corner)
                ? corner
                : undefined,
          })),
  };
}

function regionsOf(document: Document, surface: Surface): readonly Region[] {
  return orderedEntries(document.regions).filter(
    (region) => region.surfaceId === surface.id,
  );
}

function isRegionCorner(
  corner: CornerName | undefined,
): corner is RegionCorner {
  return (
    corner !== undefined &&
    (REGION_CORNERS as readonly string[]).includes(corner)
  );
}
