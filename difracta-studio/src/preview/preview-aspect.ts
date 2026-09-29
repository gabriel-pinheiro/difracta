import type { Point, Quad, SurfaceSize } from "@difracta/core";

/** The ratio of an Output nobody has opened, and of a telemetry report without a size. */
export const DEFAULT_ASPECT = 16 / 9;

/** What the header's picker offers: the Output's own ratio, or one of these. */
export const ASPECT_RATIOS = {
  "16:9": 16 / 9,
  "16:10": 16 / 10,
  "4:3": 4 / 3,
  "1:1": 1,
  "9:16": 9 / 16,
  "21:9": 21 / 9,
} as const;

export type AspectChoice = "output" | keyof typeof ASPECT_RATIOS;

export const ASPECT_CHOICES: readonly AspectChoice[] = [
  "output",
  ...(Object.keys(ASPECT_RATIOS) as (keyof typeof ASPECT_RATIOS)[]),
];

export function isAspectChoice(candidate: unknown): candidate is AspectChoice {
  return (
    typeof candidate === "string" &&
    (ASPECT_CHOICES as readonly string[]).includes(candidate)
  );
}

/** The size an Output Session last reported, if one did. */
export interface ReportedSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Width over height of the Preview of an Output: the ratio picked, or for
 * "output" the one its Output Session reports, 16:9 while none does.
 */
export function previewAspect(
  choice: AspectChoice,
  reported: ReportedSize | undefined,
): number {
  if (choice !== "output") return ASPECT_RATIOS[choice];
  if (reported === undefined) return DEFAULT_ASPECT;
  const { width, height } = reported;
  return width > 0 && height > 0 ? width / height : DEFAULT_ASPECT;
}

/**
 * Width over height of the Preview of a Surface shown flat: its size when
 * it has one, else the shape its mapping has on an Output of ratio
 * `outputAspect`, measured along its longer edges as the Surface's canvases
 * are, else 16:9.
 */
export function surfaceAspect(
  size: SurfaceSize | null,
  corners: Quad | undefined,
  outputAspect: number,
): number {
  if (size !== null) return size.width / size.height;
  if (corners === undefined) return DEFAULT_ASPECT;
  const length = (first: Point, second: Point): number =>
    Math.hypot((first.x - second.x) * outputAspect, first.y - second.y);
  const width = Math.max(
    length(corners.topLeft, corners.topRight),
    length(corners.bottomLeft, corners.bottomRight),
  );
  const height = Math.max(
    length(corners.topLeft, corners.bottomLeft),
    length(corners.topRight, corners.bottomRight),
  );
  const aspect = width / height;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
}
