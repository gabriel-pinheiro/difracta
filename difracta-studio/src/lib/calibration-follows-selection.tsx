import type { DocumentView } from "@difracta/client";
import type { Mask, Surface, Table } from "@difracta/core";
import { useEffect, useRef } from "react";

import { useSelection, type Selection } from "@/selection/selection";

import { useCalibration } from "./calibration";
import { useDocumentPath } from "./client";

/**
 * While Calibration Mode is on, selecting another Surface or Mask moves the
 * pattern to it; the view is kept and the inspector then reports its own
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
  const latest = useRef({ calibration, surfaces, masks });
  useEffect(() => {
    latest.current = { calibration, surfaces, masks };
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
    );
    if (target === undefined) return;
    if (
      target.surfaceId === current.calibration.surfaceId &&
      target.maskId === current.calibration.maskId
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
): { readonly surfaceId: string; readonly maskId: string | null } | undefined {
  if (selection?.kind === "surface") {
    const surface = surfaces[selection.id];
    return surface?.output == null
      ? undefined
      : { surfaceId: surface.id, maskId: null };
  }
  if (selection?.kind === "mask") {
    const mask = masks[selection.id];
    const surface = mask === undefined ? undefined : surfaces[mask.surfaceId];
    return mask === undefined || surface?.output == null
      ? undefined
      : { surfaceId: surface.id, maskId: mask.id };
  }
  return undefined;
}
