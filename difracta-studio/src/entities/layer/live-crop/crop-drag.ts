import { cropRect } from "@difracta/visuals";

/** The Live Visual's four crops: the fraction of the picture cut from each side. */
export interface Crop {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type CropSide = keyof Crop;

export const CROP_SIDES: readonly CropSide[] = [
  "left",
  "top",
  "right",
  "bottom",
];

/** Each side's Parameter on the Live Visual. */
export const CROP_PARAMETERS: Readonly<Record<CropSide, string>> = {
  left: "cropLeft",
  top: "cropTop",
  right: "cropRight",
  bottom: "cropBottom",
};

/** What a drag holds: one side, or the whole rectangle. */
export type CropGrip = CropSide | "move";

export interface CropGrid {
  /** The Parameters' step: every value sent is on it. None: any value. */
  readonly step: number | undefined;
  /** The least of the picture a crop leaves on each axis (`settings.shares.viewer.minCropSide`). */
  readonly minSide: number;
}

/**
 * The crops as the picture shows them: what the Live Visual's instance
 * makes of them (`cropRect`), so opposite crops that meet are drawn as it
 * draws them, Left and Top winning.
 */
export function shownCrop(crop: Crop): Crop {
  const rect = cropRect(crop);
  return {
    left: rect.x,
    top: rect.y,
    right: 1 - rect.x - rect.width,
    bottom: 1 - rect.y - rect.height,
  };
}

/**
 * The crops after dragging `grip` by `dx` and `dy`, fractions of the
 * picture's width and height, from where the drag began. A side stops
 * `minSide` short of the side facing it and at the picture's edge; the
 * whole rectangle keeps its size and stops at the edges. Every value is
 * on the step grid.
 */
export function dragCrop(
  start: Crop,
  grip: CropGrip,
  dx: number,
  dy: number,
  grid: CropGrid,
): Crop {
  const from = shownCrop(start);
  const { step } = grid;
  const snap = (value: number): number =>
    step === undefined || step <= 0
      ? value
      : Number((Math.round(value / step) * step).toFixed(6));
  const clamp = (value: number, most: number): number =>
    Math.min(Math.max(snap(value), 0), snap(most));
  switch (grip) {
    case "left":
      return {
        ...from,
        left: clamp(from.left + dx, 1 - from.right - grid.minSide),
      };
    case "right":
      return {
        ...from,
        right: clamp(from.right - dx, 1 - from.left - grid.minSide),
      };
    case "top":
      return {
        ...from,
        top: clamp(from.top + dy, 1 - from.bottom - grid.minSide),
      };
    case "bottom":
      return {
        ...from,
        bottom: clamp(from.bottom - dy, 1 - from.top - grid.minSide),
      };
    case "move": {
      const x = Math.min(Math.max(snap(dx), -from.left), from.right);
      const y = Math.min(Math.max(snap(dy), -from.top), from.bottom);
      return {
        left: snap(from.left + x),
        right: snap(from.right - x),
        top: snap(from.top + y),
        bottom: snap(from.bottom - y),
      };
    }
  }
}

/** The sides a drag of `grip` writes. */
export function sidesOf(grip: CropGrip): readonly CropSide[] {
  return grip === "move" ? CROP_SIDES : [grip];
}
