import {
  enabledCorners,
  orderedEntries,
  outputSlices,
  placedRect,
  projectionFrame,
  REGION_CORNERS,
  type CornerName,
  type Document,
  type Mask,
  type Region,
  type RegionCorner,
  type Rect,
  type ResolvedCalibration,
  type Slice,
  type Surface,
} from "@difracta/core";

import type { FramePlan, SurfaceDraw } from "./plan.ts";

/** One Slice on the Output's Slice test card. */
export interface SliceTile {
  readonly slice: Slice;
  /** Its placed rectangle, in normalized Projection Frame coordinates. */
  readonly rect: Rect;
  /** Its position among the Output's Slices, which picks its colour. */
  readonly index: number;
  /** The Slice selected in Studio: drawn brighter. */
  readonly selected: boolean;
}

/**
 * The Calibration Mode drawings of one Output. With a Surface being
 * aligned: that Surface as a highlighted pattern with its corner, Mask,
 * Path or Region outline, and the Output's other Surfaces as the view
 * says. With none, the Output itself or one of its Output Masks is being
 * aligned: every Surface on the Output as a plain pattern, none
 * highlighted, no corners, no Surface Masks, the view ignored, and the
 * Output Mask's outline over them all. With a Slice selected on an Output
 * with Slices, the Slice test card alone: every Slice's placed rectangle.
 */
export function calibrationDraws(
  document: Document,
  outputId: string,
  calibrating: ResolvedCalibration,
  masksOf: (surface: Surface) => readonly Mask[],
): Pick<FramePlan, "draws" | "outputMaskOutline" | "sliceCard"> {
  if (calibrating.slice !== undefined) {
    const sliceCard = sliceTiles(document, outputId, calibrating.slice);
    if (sliceCard.length > 0)
      return { draws: [], outputMaskOutline: undefined, sliceCard };
  }
  const draws: SurfaceDraw[] = [];
  const aligned = calibrating.surface;
  for (const surface of orderedEntries(document.surfaces)) {
    const corners = enabledCorners(document, surface, outputId);
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
    sliceCard: [],
  };
}

/** Every Slice of the Output on its test card, `selected` brighter. */
function sliceTiles(
  document: Document,
  outputId: string,
  selected: Slice,
): readonly SliceTile[] {
  const output = document.outputs[outputId];
  if (output === undefined) return [];
  const slices = outputSlices(document.slices, outputId);
  const frame = projectionFrame(output, slices);
  if (slices.length === 0 || frame === undefined) return [];
  return slices.map((slice, index) => {
    const placed = placedRect(slice);
    return {
      slice,
      rect: {
        x: (placed.x - frame.x) / frame.width,
        y: (placed.y - frame.y) / frame.height,
        width: placed.width / frame.width,
        height: placed.height / frame.height,
      },
      index,
      selected: slice.id === selected.id,
    };
  });
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
