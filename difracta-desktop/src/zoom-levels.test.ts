import { describe, expect, it } from "vitest";

import {
  ZOOM_MAX,
  ZOOM_MIN,
  zoomed,
  zoomIn,
  zoomLevel,
  zoomOut,
  zoomPercent,
} from "./zoom-levels.ts";

describe("zoom levels", () => {
  it("steps half a level each way and resets to 100%", () => {
    expect(zoomIn(0)).toBe(0.5);
    expect(zoomOut(0)).toBe(-0.5);
    expect(zoomed(2, "in")).toBe(2.5);
    expect(zoomed(2, "out")).toBe(1.5);
    expect(zoomed(2, "reset")).toBe(0);
  });

  it("stops at the limits", () => {
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomLevel(40)).toBe(ZOOM_MAX);
    expect(zoomLevel(-40)).toBe(ZOOM_MIN);
  });

  it("puts a level from elsewhere on a step, and makes a non-number 100%", () => {
    expect(zoomLevel(1.3)).toBe(1.5);
    expect(zoomIn(1.3)).toBe(2);
    expect(zoomLevel(Number.NaN)).toBe(0);
    expect(Object.is(zoomLevel(-0.1), 0)).toBe(true);
  });

  it("reads as a percentage", () => {
    expect(zoomPercent(0)).toBe(100);
    expect(zoomPercent(1)).toBe(120);
    expect(zoomPercent(2)).toBe(144);
    expect(zoomPercent(-1)).toBe(83);
    expect(zoomPercent(ZOOM_MIN)).toBe(58);
    expect(zoomPercent(ZOOM_MAX)).toBe(249);
  });
});
