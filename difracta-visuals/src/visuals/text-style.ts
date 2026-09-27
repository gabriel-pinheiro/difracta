import { fontParameter } from "../fonts/fonts.ts";

/**
 * What the text Visuals share: the Parameters that choose the font, the
 * size and the colors, and how a Fit and a Size become a size in pixels.
 */
export const TEXT_FIT_PARAMETERS = {
  font: fontParameter(),
  fit: {
    kind: "choice",
    label: "Fit",
    default: "fit",
    options: [
      { value: "fit", label: "Fit" },
      { value: "width", label: "Fill Width" },
      { value: "fixed", label: "Fixed" },
    ],
    description:
      "Fit takes the largest size at which everything fits the Target; Fill Width spans its width; Fixed draws at Size.",
  },
  size: {
    kind: "number",
    label: "Size",
    default: 1,
    min: 0.01,
    max: 1,
    step: 0.01,
    percent: true,
    description:
      "With Fixed, the height of the type as a share of the Target's height; with Fit and Fill Width, a share of the size they found.",
  },
} as const;

export const TEXT_COLOR_PARAMETERS = {
  fill: { kind: "color", label: "Fill Color", default: [1, 1, 1, 1] },
  outline: { kind: "color", label: "Outline Color", default: [0, 0, 0, 1] },
  outlineWidth: {
    kind: "number",
    label: "Outline Width",
    default: 0,
    min: 0,
    max: 0.2,
    step: 0.005,
    percent: true,
    description:
      "How far the outline reaches past the letters, as a share of the type's size; zero draws none.",
  },
} as const;

export const TEXT_MARGIN_PARAMETER = {
  kind: "number",
  label: "Margin",
  default: 0.05,
  min: 0,
  max: 0.4,
  step: 0.01,
  percent: true,
  description:
    "Kept clear on every side, as a share of the Target's shorter side.",
} as const;

/** The box left inside the Margin, in pixels. */
export function textBox(width: number, height: number, margin: number) {
  const inset = margin * Math.min(width, height);
  return {
    x: inset,
    y: inset,
    width: Math.max(0, width - inset * 2),
    height: Math.max(0, height - inset * 2),
  };
}

/** The outline a picture is asked for: none while it would not show. */
export function shownOutline(params: {
  readonly outline: readonly [number, number, number, number];
  readonly outlineWidth: number;
}): number {
  return params.outline[3] > 0 ? params.outlineWidth : 0;
}
