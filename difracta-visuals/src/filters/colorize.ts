import { defineFilter } from "@difracta/render/sdk";

export const colorize = defineFilter({
  id: "colorize",
  name: "Colorize",
  description:
    "Paints the picture in one colour: its brightness becomes a ramp from black through the colour to white.",
  notes:
    "A monochrome treatment that keeps the picture readable: every pixel's brightness is kept and its hue is replaced, dark parts running from black up to Color at mid-brightness and on to white at the top, so a clip reads as a tinted print rather than a flat wash. Color is the ink; Amount blends between the picture as it is and the tinted one, and at zero the pass is skipped. It works in straight alpha, so a soft or transparent edge keeps its shape. Nothing is animated: a still picture under it costs nothing after the first frame, and it redraws only when a Parameter changes. It belongs inside a Visual Layer, over one clip, where linking Color to a Color Controller puts every treated clip in the show's palette at once; at the root it tints the whole frame, Surfaces and all. Unlike the Tint on Image and Video, which multiplies and so can only darken, Colorize lifts the bright parts to white, so a dark clip stays legible. Stack it under Scanlines or Dither for a one-ink screen, or over Adjust when the contrast needs setting first.",
  parameters: {
    color: {
      kind: "color",
      label: "Color",
      default: [1, 0.55, 0.15, 1],
      description: "The ink: what mid-brightness becomes.",
    },
    amount: {
      kind: "number",
      label: "Amount",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How far the picture goes from its own colours to the ink.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 ink = luma < 0.5
    ? mix(vec3(0.0), u_color.rgb, luma * 2.0)
    : mix(u_color.rgb, vec3(1.0), luma * 2.0 - 1.0);
  return premultiply(vec4(mix(c.rgb, ink, u_amount), c.a));
}`,
  create() {
    return {
      update({ params, changed }) {
        return { changed, identity: params.amount <= 0 };
      },
    };
  },
});
