import type { Point } from "@difracta/core";
import type React from "react";

/** Keyboard nudging and percentage display shared by point editors. */

/**
 * Arrow keys move a point by 0.1% of its space; Shift makes it 1%, Ctrl
 * 0.01%. With `pixel`, the size of one pixel of the space on each axis,
 * they move it by one pixel instead, Shift by ten.
 */
export function nudgeFromKey(
  event: React.KeyboardEvent,
  pixel?: Point,
): Point | undefined {
  const amount =
    pixel !== undefined
      ? event.shiftKey
        ? 10
        : 1
      : event.ctrlKey || event.metaKey
        ? 0.0001
        : event.shiftKey
          ? 0.01
          : 0.001;
  const x = amount * (pixel?.x ?? 1);
  const y = amount * (pixel?.y ?? 1);
  switch (event.key) {
    case "ArrowUp":
      return { x: 0, y: -y };
    case "ArrowDown":
      return { x: 0, y };
    case "ArrowLeft":
      return { x: -x, y: 0 };
    case "ArrowRight":
      return { x, y: 0 };
    default:
      return undefined;
  }
}

export function toPercent(value: number): number {
  return Math.round(value * 10_000) / 100;
}

export function fromPercent(value: number): number {
  return Math.round(value * 100) / 10_000;
}
