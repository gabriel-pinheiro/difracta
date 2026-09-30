import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { dragCrop, shownCrop, sidesOf, type Crop } from "./crop-drag";

const grid = { step: 0.0005, minSide: settings.shares.viewer.minCropSide };
const none: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
const framed: Crop = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 };

const close = (crop: Crop) =>
  Object.fromEntries(
    (Object.entries(crop) as [string, number][]).map(([side, value]) => [
      side,
      Number(value.toFixed(6)),
    ]),
  );

describe("Dragging the crop rectangle", () => {
  it("moves one side by the fraction dragged, on the step grid", () => {
    expect(dragCrop(none, "left", 0.25012, 0.4, grid)).toEqual({
      ...none,
      left: 0.25,
    });
    expect(dragCrop(none, "right", -0.1, 0, grid).right).toBe(0.1);
    expect(dragCrop(none, "top", 0, 0.3333, grid).top).toBe(0.3335);
    expect(dragCrop(none, "bottom", 0, -0.5, grid).bottom).toBe(0.5);
  });

  it("stops a side at the picture's edge and short of the side facing it", () => {
    expect(dragCrop(framed, "left", -0.5, 0, grid).left).toBe(0);
    expect(dragCrop(framed, "right", 0.5, 0, grid).right).toBe(0);
    expect(dragCrop(framed, "left", 0.9, 0, grid).left).toBe(
      1 - framed.right - grid.minSide,
    );
    expect(dragCrop(framed, "bottom", 0, -0.9, grid).bottom).toBe(
      Number((1 - framed.top - grid.minSide).toFixed(6)),
    );
  });

  it("moves the whole rectangle at its size, up to the edges", () => {
    expect(close(dragCrop(framed, "move", 0.05, -0.05, grid))).toEqual({
      left: 0.15,
      top: 0.15,
      right: 0.25,
      bottom: 0.15,
    });
    expect(close(dragCrop(framed, "move", 1, 1, grid))).toEqual({
      left: 0.4,
      top: 0.3,
      right: 0,
      bottom: 0,
    });
    expect(close(dragCrop(framed, "move", -1, -1, grid))).toEqual({
      left: 0,
      top: 0,
      right: 0.4,
      bottom: 0.3,
    });
  });

  it("starts from the rectangle the Visual shows when the crops cross", () => {
    const crossed: Crop = { left: 0.7, top: 0, right: 0.5, bottom: 0 };
    expect(close(shownCrop(crossed))).toEqual({
      left: 0.7,
      top: 0,
      right: Number((0.3 - grid.minSide).toFixed(6)),
      bottom: 0,
    });
    expect(dragCrop(crossed, "right", 0.1, 0, grid).right).toBe(0.19);
  });

  it("takes any value without a step", () => {
    expect(
      dragCrop(none, "left", 0.12345, 0, { ...grid, step: undefined }).left,
    ).toBe(0.12345);
  });

  it("writes one side, or all four when the rectangle moves", () => {
    expect(sidesOf("top")).toEqual(["top"]);
    expect(sidesOf("move")).toEqual(["left", "top", "right", "bottom"]);
  });
});
