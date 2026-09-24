/**
 * Studio's zoom in Desktop, in Electron's zoom levels: 0 is 100%, and every
 * level scales by 1.2, so a level of 1 is 120% and -1 is about 83%. Zoom In
 * and Zoom Out move half a level, the step of Electron's own zoom roles,
 * between about 58% (-3) and 249% (+5).
 */
export const ZOOM_STEP = 0.5;
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 5;

export type ZoomChange = "in" | "out" | "reset";

/** Any number as a level Desktop uses: on a step, inside the limits; 0 for one that is no number. */
export function zoomLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  const stepped = Math.round(level / ZOOM_STEP) * ZOOM_STEP;
  // `+ 0` turns a -0 into 0.
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped)) + 0;
}

export const zoomIn = (level: number): number =>
  zoomLevel(zoomLevel(level) + ZOOM_STEP);
export const zoomOut = (level: number): number =>
  zoomLevel(zoomLevel(level) - ZOOM_STEP);
export const resetZoom = (): number => 0;

export function zoomed(level: number, change: ZoomChange): number {
  if (change === "in") return zoomIn(level);
  if (change === "out") return zoomOut(level);
  return resetZoom();
}

/** The level as the percentage a person reads, rounded to a whole one. */
export function zoomPercent(level: number): number {
  return Math.round(100 * 1.2 ** level);
}
