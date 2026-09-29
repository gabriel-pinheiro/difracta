import type { DocumentView } from "@difracta/client";
import {
  type Mask,
  type Path,
  type Region,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect, useRef } from "react";

import { useSelection, type Selection } from "@/selection/selection";
import { selectionSurface } from "@/selection/selection-surface";

import { useCalibration } from "./calibration";
import { useDocumentPath } from "./client";
import { followedOutput } from "./mapping-output";

/**
 * While Calibration Mode is on, selecting another Surface, Mask, Path or
 * Region moves the pattern to it, on the same Output when it can
 * (`followedOutput`); the view is kept and the inspector then reports its
 * own corner or point. Selecting anything else leaves the mode as it is, so a
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
    const target = selectionSurface(selection, current);
    if (target === undefined) return;
    const { surface, ...shape } = target;
    const outputId = followedOutput(surface, current.calibration.outputId);
    if (outputId === undefined) return;
    if (
      surface.id === current.calibration.surfaceId &&
      target.maskId === current.calibration.maskId &&
      target.pathId === current.calibration.pathId &&
      target.regionId === current.calibration.regionId
    )
      return;
    set({
      ...current.calibration,
      ...shape,
      surfaceId: surface.id,
      outputId,
      corner: null,
      point: null,
    });
  }, [selection, set]);
  return null;
}
