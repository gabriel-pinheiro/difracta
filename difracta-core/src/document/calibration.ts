import type {
  Calibration,
  Document,
  Mask,
  OutputMask,
  Path,
  Region,
  Surface,
} from "./document.ts";
import { isEnabledOn } from "./mappings.ts";

/** Calibration Mode with its references checked against the document. */
export interface ResolvedCalibration {
  readonly calibration: Calibration;
  /** The Surface being aligned; undefined when the Output itself is. */
  readonly surface: Surface | undefined;
  readonly outputId: string;
  readonly mask: Mask | undefined;
  readonly path: Path | undefined;
  readonly region: Region | undefined;
  /** The Output Mask being aligned over the Output's patterns. */
  readonly outputMask: OutputMask | undefined;
  /** Selected Mask, Path or Output Mask point, clamped to its points. */
  readonly point: number | undefined;
}

/**
 * The effective Calibration Mode, or undefined when there is none or what it
 * names has since gone: its Output removed, its Surface removed or taken off
 * that Output, its Mask, Path, Region or Output Mask removed. Authoring
 * commands do not touch operational state, so a stale entry can exist
 * briefly; readers go through here and treat it as no calibration.
 */
export function resolveCalibration(
  document: Document,
): ResolvedCalibration | undefined {
  const calibration = document.operational.calibration;
  if (calibration === null) return undefined;
  if (!(calibration.outputId in document.outputs)) return undefined;
  const outputMask =
    calibration.outputMaskId === null
      ? undefined
      : document.outputMasks[calibration.outputMaskId];
  if (
    calibration.outputMaskId !== null &&
    outputMask?.outputId !== calibration.outputId
  )
    return undefined;
  if (calibration.surfaceId === null) {
    const point =
      outputMask === undefined || calibration.point === null
        ? undefined
        : Math.min(calibration.point, outputMask.points.length - 1);
    return {
      calibration,
      surface: undefined,
      outputId: calibration.outputId,
      mask: undefined,
      path: undefined,
      region: undefined,
      outputMask,
      point,
    };
  }
  const surface = document.surfaces[calibration.surfaceId];
  if (surface === undefined) return undefined;
  if (!isEnabledOn(surface, calibration.outputId)) return undefined;
  const mask =
    calibration.maskId === null
      ? undefined
      : document.masks[calibration.maskId];
  if (calibration.maskId !== null && mask?.surfaceId !== surface.id)
    return undefined;
  const path =
    calibration.pathId === null
      ? undefined
      : document.paths[calibration.pathId];
  if (calibration.pathId !== null && path?.surfaceId !== surface.id)
    return undefined;
  const region =
    calibration.regionId === null
      ? undefined
      : document.regions[calibration.regionId];
  if (calibration.regionId !== null && region?.surfaceId !== surface.id)
    return undefined;
  const shape = mask ?? path;
  const point =
    shape === undefined || calibration.point === null
      ? undefined
      : Math.min(calibration.point, shape.points.length - 1);
  return {
    calibration,
    surface,
    outputId: calibration.outputId,
    mask,
    path,
    region,
    outputMask: undefined,
    point,
  };
}
