import { defineFilter } from "@difracta/render/sdk";

export const threshold = defineFilter({
  id: "threshold",
  name: "Threshold",
  description:
    "Cuts the picture to pure white and black at one brightness, with an optional soft edge.",
  notes:
    "A two-tone cut-out: everything brighter than Level goes white, everything darker goes black, and Softness widens the step into a short grey ramp so an edge does not crawl. Level is the brightness, from 0 to 1, that divides the two; with Softness at zero the cut is hard to the pixel. Alpha is kept, so a clip on a transparent ground stays a cut-out of its own shape, and the pass works in straight alpha. It always does something, so there is no setting at which it passes through; use the Layer's Mix to ease it in. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. Inside a Visual Layer it turns one clip into a stencil, the usual move before Colorize in its Tint Mode (white becomes the ink) or on an Additive Layer where the black adds nothing and only the white shape lights the wall; at the root it cuts the whole frame. Link Level to a Number Controller and sweep it for a wipe through the clip's tones.",
  parameters: {
    level: {
      kind: "number",
      label: "Level",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "The brightness that divides white from black.",
    },
    softness: {
      kind: "number",
      label: "Softness",
      default: 0.05,
      min: 0,
      max: 0.5,
      step: 0.01,
      percent: true,
      description: "How wide the step is; zero cuts hard.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float half_width = max(u_softness, 1e-4) * 0.5;
  float value = smoothstep(u_level - half_width, u_level + half_width, luma);
  return premultiply(vec4(vec3(value), c.a));
}`,
});
