import type {
  Calibration,
  Document,
  Mask,
  Path,
  Region,
  Surface,
} from "./document.ts";

/** Calibration Mode with its references checked against the document. */
export interface ResolvedCalibration {
  readonly calibration: Calibration;
  readonly surface: Surface;
  readonly outputId: string;
  readonly mask: Mask | undefined;
  readonly path: Path | undefined;
  readonly region: Region | undefined;
  /** Selected Mask or Path point, clamped to its points. */
  readonly point: number | undefined;
}

/**
 * The effective Calibration Mode, or undefined when there is none or its
 * Surface has since been removed or unassigned. Authoring commands do not
 * touch operational state, so a stale entry can exist briefly; readers go
 * through here and treat it as no calibration.
 */
export function resolveCalibration(
  document: Document,
): ResolvedCalibration | undefined {
  const calibration = document.operational.calibration;
  if (calibration === null) return undefined;
  const surface = document.surfaces[calibration.surfaceId];
  if (surface?.output == null) return undefined;
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
    outputId: surface.output,
    mask,
    path,
    region,
    point,
  };
}
