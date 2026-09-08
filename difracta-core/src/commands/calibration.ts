import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { CalibrationSchema, type Calibration } from "../document/document.ts";

/**
 * Enters or changes Calibration Mode with the whole state at once: the
 * Surface or Mask being aligned, the highlighted corner or point, the view.
 * Performance kind: replicated to the Output at once, never in undo history.
 */
export const calibrationSet = defineCommand({
  name: "calibration.set",
  kind: "performance",
  description: "Show a Surface or Mask as a calibration pattern on its Output.",
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
    a.corner === b.corner &&
    a.point === b.point &&
    a.view === b.view &&
    a.owner === b.owner
  );
}
