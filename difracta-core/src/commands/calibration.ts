import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  CalibrationSchema,
  REGION_CORNERS,
  type Calibration,
  type RegionCorner,
} from "../document/document.ts";
import { pickOutput } from "../document/mappings.ts";

/**
 * Enters or changes Calibration Mode with the whole state at once: the
 * Surface, Mask, Path or Region being aligned, the one Output showing it,
 * the highlighted corner or point, the view.
 * Performance kind: replicated to the Output at once, never in undo history.
 */
export const calibrationSet = defineCommand({
  name: "calibration.set",
  kind: "performance",
  description:
    "Show a Surface, or a Mask, Path or Region of it, as a calibration pattern on one of its Outputs.",
  payload: CalibrationSchema.extend({
    /** Needed once the Surface is on several Outputs. */
    outputId: z.string().min(1).optional(),
  }),
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const picked = pickOutput(document, surface, payload.outputId);
    if (!picked.ok) return rejected(picked.error);
    const next: Calibration = { ...payload, outputId: picked.outputId };
    if (payload.maskId !== null) {
      const mask = document.masks[payload.maskId];
      if (mask?.surfaceId !== surface.id)
        return rejected(
          `Mask “${payload.maskId}” is not a Mask of “${surface.name}”.`,
        );
      if (payload.point !== null && payload.point >= mask.points.length)
        return rejected(`Mask “${mask.name}” has no point ${payload.point}.`);
    }
    if (payload.pathId !== null) {
      if (payload.maskId !== null)
        return rejected("Calibration aligns a Mask or a Path, not both.");
      const path = document.paths[payload.pathId];
      if (path?.surfaceId !== surface.id)
        return rejected(
          `Path “${payload.pathId}” is not a Path of “${surface.name}”.`,
        );
      if (payload.point !== null && payload.point >= path.points.length)
        return rejected(`Path “${path.name}” has no point ${payload.point}.`);
    }
    if (payload.regionId !== null) {
      if (payload.maskId !== null || payload.pathId !== null)
        return rejected(
          "Calibration aligns one Mask, Path or Region at a time.",
        );
      const region = document.regions[payload.regionId];
      if (region?.surfaceId !== surface.id)
        return rejected(
          `Region “${payload.regionId}” is not a Region of “${surface.name}”.`,
        );
      if (
        payload.corner !== null &&
        !REGION_CORNERS.includes(payload.corner as RegionCorner)
      )
        return rejected(`A Region has no ${payload.corner} corner.`);
    }
    const current = document.operational.calibration;
    if (current !== null && sameCalibration(current, next)) return accepted([]);
    return accepted([
      { op: "set", path: ["operational", "calibration"], value: next },
    ]);
  },
});

export const calibrationExit = defineCommand({
  name: "calibration.exit",
  kind: "performance",
  description: "Leave Calibration Mode.",
  payload: z.object({}).strict(),
  apply({ document }) {
    if (document.operational.calibration === null) return accepted([]);
    return accepted([
      { op: "set", path: ["operational", "calibration"], value: null },
    ]);
  },
});

function sameCalibration(a: Calibration, b: Calibration): boolean {
  return (
    a.surfaceId === b.surfaceId &&
    a.outputId === b.outputId &&
    a.maskId === b.maskId &&
    a.pathId === b.pathId &&
    a.regionId === b.regionId &&
    a.corner === b.corner &&
    a.point === b.point &&
    a.view === b.view &&
    a.owner === b.owner
  );
}
