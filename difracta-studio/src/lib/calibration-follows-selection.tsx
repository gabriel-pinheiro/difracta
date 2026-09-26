import type { DocumentView } from "@difracta/client";
import type { Mask, Path, Region, Surface, Table } from "@difracta/core";
import { useEffect, useRef } from "react";

import { useSelection, type Selection } from "@/selection/selection";

import { useCalibration } from "./calibration";
import { useDocumentPath } from "./client";

/**
 * While Calibration Mode is on, selecting another Surface, Mask, Path or
 * Region moves the pattern to it; the view is kept and the inspector then reports its own
 * corner or point. Selecting anything else leaves the mode as it is, so a
 * glance at an Output's stats does not drop the pattern on stage. Reacts to
 * selection changes only: another Studio moving the calibration must not be
 * pulled back here.
 */
export function CalibrationFollowsSelection({
  view,
}: {
  readonly view: DocumentView;
}) {
  const { selection } = useSelection();
  const { calibration, set } = useCalibration(view);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  const latest = useRef({ calibration, surfaces, masks, paths, regions });
  useEffect(() => {
    latest.current = { calibration, surfaces, masks, paths, regions };
  });
  const previous = useRef<Selection | undefined>(selection);
  useEffect(() => {
    if (previous.current === selection) return;
    previous.current = selection;
    const current = latest.current;
    if (current.calibration === null) return;
    const target = calibrationTarget(
      selection,
      current.surfaces,
      current.masks,
      current.paths,
      current.regions,
    );
    if (target === undefined) return;
    if (
      target.surfaceId === current.calibration.surfaceId &&
      target.maskId === current.calibration.maskId &&
      target.pathId === current.calibration.pathId &&
      target.regionId === current.calibration.regionId
    )
      return;
    set({ ...current.calibration, ...target, corner: null, point: null });
  }, [selection, set]);
  return null;
}

function calibrationTarget(
  selection: Selection | undefined,
  surfaces: Table<Surface>,
  masks: Table<Mask>,
  paths: Table<Path>,
  regions: Table<Region>,
):
  | {
      readonly surfaceId: string;
      readonly maskId: string | null;
      readonly pathId: string | null;
      readonly regionId: string | null;
    }
  | undefined {
  const none = { maskId: null, pathId: null, regionId: null };
  if (selection?.kind === "surface") {
    const surface = surfaces[selection.id];
    return surface?.output == null
      ? undefined
      : { surfaceId: surface.id, ...none };
  }
  if (selection?.kind === "mask") {
    const mask = masks[selection.id];
    const surface = mask === undefined ? undefined : surfaces[mask.surfaceId];
    return mask === undefined || surface?.output == null
      ? undefined
      : { surfaceId: surface.id, ...none, maskId: mask.id };
  }
  if (selection?.kind === "path") {
    const path = paths[selection.id];
    const surface = path === undefined ? undefined : surfaces[path.surfaceId];
    return path === undefined || surface?.output == null
      ? undefined
      : { surfaceId: surface.id, ...none, pathId: path.id };
  }
  if (selection?.kind === "region") {
    const region = regions[selection.id];
    const surface =
      region === undefined ? undefined : surfaces[region.surfaceId];
    return region === undefined || surface?.output == null
      ? undefined
      : { surfaceId: surface.id, ...none, regionId: region.id };
  }
  return undefined;
}
