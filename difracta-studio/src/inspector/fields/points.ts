import type { Point } from "@difracta/core";
import type React from "react";

/** Keyboard nudging and percentage display shared by point editors. */

/** Arrow keys move a point by 0.1% of its space; Shift makes it 1%, Ctrl 0.01%. */
export function nudgeFromKey(event: React.KeyboardEvent): Point | undefined {
  const amount =
    event.ctrlKey || event.metaKey ? 0.0001 : event.shiftKey ? 0.01 : 0.001;
  switch (event.key) {
    case "ArrowUp":
      return { x: 0, y: -amount };
    case "ArrowDown":
      return { x: 0, y: amount };
    case "ArrowLeft":
      return { x: -amount, y: 0 };
    case "ArrowRight":
      return { x: amount, y: 0 };
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
