import type { Calibration, Document, Mask, Surface } from "./document.ts";

/** Calibration Mode with its references checked against the document. */
export interface ResolvedCalibration {
  readonly calibration: Calibration;
  readonly surface: Surface;
  readonly outputId: string;
  readonly mask: Mask | undefined;
  /** Selected Mask point, clamped to the Mask's points. */
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
  const point =
    mask === undefined || calibration.point === null
      ? undefined
      : Math.min(calibration.point, mask.points.length - 1);
  return { calibration, surface, outputId: surface.output, mask, point };
}
