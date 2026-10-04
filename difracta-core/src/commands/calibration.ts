import { z } from "zod";

import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import {
  CalibrationSchema,
  REGION_CORNERS,
  type Calibration,
  type Document,
  type RegionCorner,
} from "../document/document.ts";
import { pickOutput } from "../document/mappings.ts";

const CalibrationPayload = CalibrationSchema.extend({
  /** Needed once the Surface is on several Outputs, and always without a Surface. */
  outputId: z.string().min(1).optional(),
});
type Payload = z.infer<typeof CalibrationPayload>;

/**
 * Enters or changes Calibration Mode with the whole state at once: the
 * Surface, Mask, Path or Region being aligned and the one Output showing
 * it; or, with no Surface, the Output alone or one of its Output Masks; the
 * highlighted corner or point; the view.
 * Performance kind: replicated to the Output at once, never in undo history.
 */
export const calibrationSet = defineCommand({
  name: "calibration.set",
  kind: "performance",
  description:
    "Show a Surface, or a Mask, Path or Region of it, as a calibration pattern on one of its Outputs; or every Surface of an Output, alone or under one of its Output Masks.",
  payload: CalibrationPayload,
  apply({ document, payload }) {
    return payload.surfaceId === null
      ? applyOutput(document, payload)
      : applySurface(document, payload, payload.surfaceId);
  },
});

/** The Output itself, or one of its Output Masks: nothing of a Surface may come along. */
function applyOutput(document: Document, payload: Payload): CommandOutcome {
  if (payload.outputId === undefined)
    return rejected("Calibrating an Output needs its outputId.");
  const output = document.outputs[payload.outputId];
  if (output === undefined)
    return rejected(`Output “${payload.outputId}” does not exist.`);
  if (
    payload.maskId !== null ||
    payload.pathId !== null ||
    payload.regionId !== null ||
    payload.corner !== null
  )
    return rejected(
      "Calibrating an Output aligns no Mask, Path, Region or corner; name a Surface for those.",
    );
  if (payload.outputMaskId !== null) {
    const mask = document.outputMasks[payload.outputMaskId];
    if (mask?.outputId !== output.id)
      return rejected(
        `Output Mask “${payload.outputMaskId}” is not an Output Mask of “${output.name}”.`,
      );
    if (payload.point !== null && payload.point >= mask.points.length)
      return rejected(
        `Output Mask “${mask.name}” has no point ${payload.point}.`,
      );
  } else if (payload.point !== null)
    return rejected("An Output alone has no point to highlight.");
  return enter(document, { ...payload, outputId: output.id });
}

function applySurface(
  document: Document,
  payload: Payload,
  surfaceId: string,
): CommandOutcome {
  const surface = document.surfaces[surfaceId];
  if (surface === undefined)
    return rejected(`Surface “${surfaceId}” does not exist.`);
  if (payload.outputMaskId !== null)
    return rejected(
      "An Output Mask is calibrated on its Output alone, with no Surface.",
    );
  const picked = pickOutput(document, surface, payload.outputId);
  if (!picked.ok) return rejected(picked.error);
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
      return rejected("Calibration aligns one Mask, Path or Region at a time.");
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
  return enter(document, { ...payload, outputId: picked.outputId });
}

function enter(document: Document, next: Calibration): CommandOutcome {
  const current = document.operational.calibration;
  if (current !== null && sameCalibration(current, next)) return accepted([]);
  return accepted([
    { op: "set", path: ["operational", "calibration"], value: next },
  ]);
}

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
    a.outputMaskId === b.outputMaskId &&
    a.maskId === b.maskId &&
    a.pathId === b.pathId &&
    a.regionId === b.regionId &&
    a.corner === b.corner &&
    a.point === b.point &&
    a.view === b.view &&
    a.owner === b.owner
  );
}
