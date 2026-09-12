import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { CalibrationSchema, type Calibration } from "../document/document.ts";

/**
 * Enters or changes Calibration Mode with the whole state at once: the
 * Surface, Mask or Path being aligned, the highlighted corner or point, the
 * view.
 * Performance kind: replicated to the Output at once, never in undo history.
 */
export const calibrationSet = defineCommand({
  name: "calibration.set",
  kind: "performance",
  description:
    "Show a Surface, or a Mask or Path of it, as a calibration pattern on its Output.",
  payload: CalibrationSchema,
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    if (surface.output === null)
      return rejected(
        `Surface “${surface.name}” has no Output to calibrate on.`,
      );
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
    const current = document.operational.calibration;
    if (current !== null && sameCalibration(current, payload))
      return accepted([]);
    return accepted([
      { op: "set", path: ["operational", "calibration"], value: payload },
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
    a.maskId === b.maskId &&
    a.pathId === b.pathId &&
    a.corner === b.corner &&
    a.point === b.point &&
    a.view === b.view &&
    a.owner === b.owner
  );
}
