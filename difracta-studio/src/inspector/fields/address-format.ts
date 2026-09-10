import type { Color, NumberRange } from "@difracta/core";

/** How a number Address is shown and typed: percent ranges display 0 to 100, others as they are. */

export function displayScale(range: NumberRange): number {
  return range.percent === true ? 100 : 1;
}

export function displayUnit(range: NumberRange): string {
  return range.percent === true ? "%" : (range.unit ?? "");
}

/** Decimals worth showing for a step: 1 → 0, 0.1 → 1, 0.25 → 2; two when there is no step. */
export function decimalsFor(range: NumberRange): number {
  const step = range.step;
  if (step === undefined) return 2;
  const shown = step * displayScale(range);
  if (Number.isInteger(shown)) return 0;
  const text = shown.toString();
  const exponent = text.indexOf("e-");
  if (exponent !== -1) return Number(text.slice(exponent + 2));
  return Math.min(6, text.split(".")[1]?.length ?? 0);
}

export function formatNumber(value: number, range: NumberRange): string {
  return (value * displayScale(range)).toFixed(decimalsFor(range));
}

/** A typed display value back into the Address's scale, clamped to the range. */
export function parseNumber(
  text: string,
  range: NumberRange,
): number | undefined {
  const typed = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(typed)) return undefined;
  const value = typed / displayScale(range);
  return Math.min(range.max, Math.max(range.min, value));
}

const channel = (value: number): string =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

/** The RGB part of a Color as `#rrggbb`, what a color input speaks. */
export function colorToHex(color: Color): string {
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** `#rgb`, `#rrggbb`, with or without the hash; alpha is kept from `alpha`. */
export function hexToColor(text: string, alpha: number): Color | undefined {
  const hex = text.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex.replaceAll(/[0-9a-f]/gi, (digit) => digit + digit)
      : hex.length === 6
        ? hex
        : undefined;
  if (full === undefined || !/^[0-9a-f]{6}$/i.test(full)) return undefined;
  const part = (at: number): number =>
    parseInt(full.slice(at, at + 2), 16) / 255;
  return [part(0), part(2), part(4), alpha];
}
