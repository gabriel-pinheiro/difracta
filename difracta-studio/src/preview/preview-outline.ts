import {
  enabledCorners,
  regionRect,
  type Document,
  type Point,
  type Rect,
} from "@difracta/core";
import { homography, project } from "@difracta/render";

import type { Selection } from "@/selection/selection";

import { framedOn, type PreviewTarget } from "./preview-target";

/**
 * The selection's outline in the Preview's frame, 0..1 with y down, corners
 * clockwise from the top left: a Surface or a Region of one on the Output
 * shown, or a Region of the Surface shown flat, a Layer being shown on
 * either. Undefined for anything else, and for a mapping too degenerate to
 * project through.
 */
export function previewOutline({
  document,
  target,
  selection,
}: {
  readonly document: Pick<Document, "surfaces" | "regions">;
  readonly target: PreviewTarget;
  readonly selection: Selection | undefined;
}): readonly Point[] | undefined {
  const on = framedOn(target);
  const region =
    selection?.kind === "region" ? document.regions[selection.id] : undefined;
  if (on.framing === "surface")
    return region?.surfaceId === on.surfaceId
      ? rectangle(regionRect(region.bounds))
      : undefined;
  const surfaceId =
    selection?.kind === "surface" ? selection.id : region?.surfaceId;
  const surface =
    surfaceId === undefined ? undefined : document.surfaces[surfaceId];
  if (surface === undefined) return undefined;
  const corners = enabledCorners(surface, on.outputId);
  if (corners === undefined) return undefined;
  if (region === undefined)
    return [
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ];
  const matrix = homography(corners);
  return matrix === undefined
    ? undefined
    : rectangle(regionRect(region.bounds)).map(({ x, y }) =>
        project(matrix, x, y),
      );
}

function rectangle({ x, y, width, height }: Rect): readonly Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}
