import { defineFilter } from "@difracta/render/sdk";

export const adjust = defineFilter({
  id: "adjust",
  name: "Adjust",
  description:
    "Brightness, contrast, saturation and gamma for one picture, the basic grade.",
  notes:
    "The plain grade, in the order a grade is done: Brightness adds or takes a flat amount, Contrast stretches around mid-grey (1 leaves it, 0 flattens to grey, 2 is harsh), Saturation scales the colour against its own grey (0 is monochrome, 2 is lurid), and Gamma bends the mid-tones last (below 1 lifts them, above 1 sinks them) without moving black or white. At the neutral values the pass is skipped. It works in straight alpha, so a soft edge keeps its shape, and the result is clamped, so a Contrast that pushes past white clips rather than wrapping. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, where each clip gets its own grade and Brightness or Saturation linked to a Number Controller is a per-clip fader; at the root it grades the whole frame. Stack it first, under Colorize or Hue Shift, so they get a picture with its contrast set; a Saturation at zero under Colorize is redundant, since Colorize drops the hue itself.",
  parameters: {
    brightness: {
      kind: "number",
      label: "Brightness",
      default: 0,
      min: -1,
      max: 1,
      step: 0.01,
      description: "Added to every channel; negative darkens.",
    },
    contrast: {
      kind: "number",
      label: "Contrast",
      default: 1,
      min: 0,
      max: 2,
      step: 0.01,
      description: "Stretch around mid-grey; 1 leaves the picture as it is.",
    },
    saturation: {
      kind: "number",
      label: "Saturation",
      default: 1,
      min: 0,
      max: 2,
      step: 0.01,
      description: "Colour against grey; 0 is monochrome, 1 as it is.",
    },
    gamma: {
      kind: "number",
      label: "Gamma",
      default: 1,
      min: 0.2,
      max: 5,
      step: 0.05,
      description: "Bends the mid-tones; below 1 lifts them, 1 leaves them.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  vec3 color = c.rgb + u_brightness;
  color = (color - 0.5) * u_contrast + 0.5;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, u_saturation);
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / u_gamma));
  return premultiply(vec4(color, c.a));
}`,
  create() {
    return {
      update({ params, changed }) {
        return {
          changed,
          identity:
            params.brightness === 0 &&
            params.contrast === 1 &&
            params.saturation === 1 &&
            params.gamma === 1,
        };
      },
    };
  },
});
