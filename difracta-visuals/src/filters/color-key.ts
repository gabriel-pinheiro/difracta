import { defineFilter } from "@difracta/render/sdk";

export const colorKey = defineFilter({
  id: "color-key",
  name: "Color Key",
  description:
    "Makes every pixel near one colour transparent, so a clip's background drops out and what is under it shows through.",
  notes:
    "A keyer for one clip: pixels within Tolerance of Color become transparent, Softness fades the ones just outside it, and Invert keeps only the matching pixels instead, cutting everything else. Color is compared in straight RGB, so it is a colour key, not a chroma key: a flat, evenly lit background keys cleanly, a noisy or shaded one needs more Tolerance and some Softness, and a halo at the edge is Softness too low. Black is the default because clips with a black background are the common case, but note that a Layer in Additive blend mode already drops black, since black adds nothing: key only when the clip must sit in Normal blend over something, or when the background is not black. What the key removes shows whatever lies under the Layer, so the Layer's blend mode and opacity still apply to what remains. It works in straight alpha and keeps a soft edge soft. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, directly over the clip and below any colour Filter, since a Colorize or Hue Shift above it would move the colour it looks for; at the root it keys the whole frame, which punches holes across Surfaces. There is no setting at which it passes through: use the Layer's Mix to ease it off.",
  parameters: {
    color: {
      kind: "color",
      label: "Color",
      default: [0, 0, 0, 1],
      description: "The colour to remove; black for most clips.",
    },
    tolerance: {
      kind: "number",
      label: "Tolerance",
      default: 0.12,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How far from Color a pixel may be and still go.",
    },
    softness: {
      kind: "number",
      label: "Softness",
      default: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How far past Tolerance the edge fades instead of cutting.",
    },
    invert: {
      kind: "boolean",
      label: "Invert",
      default: false,
      description: "Keep only the matching pixels and remove the rest.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  float distance = length(c.rgb - u_color.rgb) / sqrt(3.0);
  float match = 1.0 - smoothstep(u_tolerance, u_tolerance + max(u_softness, 1e-4), distance);
  float keep = u_invert ? match : 1.0 - match;
  return premultiply(vec4(c.rgb, c.a * keep));
}`,
});
