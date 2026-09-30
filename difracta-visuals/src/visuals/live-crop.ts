import { settings } from "@difracta/core";

/** The part of a picture a crop leaves, in fractions of it: where it starts and how much there is. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The rectangle four crops leave, each the fraction cut from its side.
 * Opposite crops that would meet or cross are held back so that
 * `settings.shares.viewer.minCropSide` of the picture always remains: Left
 * and Top are taken as they are, up to that, and Right and Bottom give way.
 */
export function cropRect(crop: {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}): CropRect {
  const [x, width] = side(crop.left, crop.right);
  const [y, height] = side(crop.top, crop.bottom);
  return { x, y, width, height };
}

function side(near: number, far: number): [start: number, size: number] {
  const least = settings.shares.viewer.minCropSide;
  const start = Math.min(Math.max(near, 0), 1 - least);
  const end = Math.max(1 - Math.max(far, 0), start + least);
  return [start, end - start];
}
