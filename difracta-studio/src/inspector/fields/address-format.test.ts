import { describe, expect, it } from "vitest";

import {
  colorToHex,
  decimalsFor,
  formatNumber,
  hexToColor,
  parseNumber,
} from "./address-format.ts";

describe("address formatting", () => {
  it("shows numbers at the precision of their step, percent ranges as 0 to 100", () => {
    expect(decimalsFor({ min: 0, max: 10, step: 1 })).toBe(0);
    expect(decimalsFor({ min: 0, max: 1, step: 0.01 })).toBe(2);
    expect(decimalsFor({ min: 0, max: 1, step: 0.25 })).toBe(2);
    expect(decimalsFor({ min: 0, max: 1 })).toBe(2);
    expect(decimalsFor({ min: 0, max: 1, step: 0.01, percent: true })).toBe(0);
    expect(
      formatNumber(0.615, { min: 0, max: 1, step: 0.01, percent: true }),
    ).toBe("62");
    expect(formatNumber(2.5, { min: 0, max: 4, step: 0.1 })).toBe("2.5");
  });

  it("parses typed values in the shown scale, snapped to the step and clamped to the range", () => {
    expect(parseNumber("500", { min: 0, max: 100, step: 1 })).toBe(100);
    expect(parseNumber("-3", { min: 0, max: 100, step: 1 })).toBe(0);
    expect(parseNumber("0.37", { min: 0, max: 4, step: 0.1 })).toBeCloseTo(0.4);
    expect(parseNumber("1005", { min: 0, max: 2000, step: 10 })).toBe(1010);
    expect(parseNumber("0.37", { min: 0, max: 4 })).toBe(0.37);
    expect(
      parseNumber("40", { min: 0, max: 1, step: 0.01, percent: true }),
    ).toBe(0.4);
    expect(parseNumber("abc", { min: 0, max: 1 })).toBeUndefined();
    expect(parseNumber("", { min: 0, max: 1 })).toBeUndefined();
  });

  it("converts colors to and from hex, keeping the alpha it is given", () => {
    expect(colorToHex([1, 0.5, 0, 1])).toBe("#ff8000");
    expect(hexToColor("#ff8000", 0.5)).toEqual([1, 128 / 255, 0, 0.5]);
    expect(hexToColor("fff", 1)).toEqual([1, 1, 1, 1]);
    expect(hexToColor("#12", 1)).toBeUndefined();
    expect(hexToColor("#gggggg", 1)).toBeUndefined();
  });
});
