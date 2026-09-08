import type { CornerName, Point } from "@difracta/core";
import type React from "react";

/** Presentation of Surface Mapping corners: labels and keyboard nudging. */
export const cornerLabels: Record<CornerName, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomRight: "Bottom right",
  bottomLeft: "Bottom left",
};

export const cornerShortLabels: Record<CornerName, string> = {
  topLeft: "TL",
  topRight: "TR",
  bottomRight: "BR",
  bottomLeft: "BL",
};

/** Arrow keys move a corner by 0.1% of the frame; Shift makes it 1%, Ctrl 0.01%. */
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
