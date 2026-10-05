import { defineFilter } from "@difracta/render/sdk";
import { HSV_GLSL } from "./hsv-glsl.ts";
import { hueOf } from "./hue-shift.ts";

export const colorize = defineFilter({
  id: "colorize",
  name: "Colorize",
  description:
    "Paints the picture in one colour, by one of four rules: a tint, a tritone ramp, its hue alone or its hue and saturation.",
  notes:
    "A one-ink treatment of the picture, in straight alpha so a soft or transparent edge keeps its shape; Color is the ink and Mode says how it is applied. Tritone, the default, keeps the brightness and replaces the hue with a ramp from black through Color at mid-brightness to white at the top, which lifts the bright parts of a dark clip to white and keeps it legible, but leaves a clip that is only black and white untouched. Tint multiplies the picture's brightness by Color: white becomes the ink, black stays black and greys become its shades, so a white-on-black clip, cut out by Threshold or drawn that way, reads exactly as it does under the Tint of Image and Video, and on an Additive Layer the black adds nothing and only the drawing lights the wall; a clip that has colours of its own is flattened to its brightness first, so it becomes one ink rather than a filtered print. Hue keeps every pixel's saturation and brightness and moves its hue to Color's, so a clip of many colours becomes one hue with its pastels and vivids kept apart; a grey has no hue to move, so on a grey clip it does nothing, and Tint is the one to use. Hue and Saturation moves the pixel's hue and saturation to Color's and keeps only its brightness: one flat ink over any clip, grey or coloured, painted at the clip's own light levels whatever Color's brightness is, so a dark red Color still paints the highlights full red. Amount blends between the picture as it is and the painted one, and at zero the pass is skipped, as it is in the two Hue modes when Color is a grey, which has no hue. Nothing is animated: a still picture under it costs nothing after the first frame, and it redraws only when a Parameter changes. It belongs inside a Visual Layer, over one clip, where linking Color to a Color Controller puts every treated clip in the show's palette at once; at the root it paints the whole frame, Surfaces and all. Stack it over Threshold for a stencil in one ink, under Scanlines or Dither for a one-ink screen, or over Adjust when the contrast needs setting first; use Hue Shift instead when the clip's own hues should move together and keep their spread.",
  parameters: {
    mode: {
      kind: "choice",
      label: "Mode",
      default: "tritone",
      options: [
        { value: "tritone", label: "Tritone" },
        { value: "tint", label: "Tint" },
        { value: "hue", label: "Hue" },
        { value: "hue-saturation", label: "Hue and Saturation" },
      ],
      description:
        "Tritone ramps black through Color to white; Tint multiplies brightness by Color; Hue moves only the hue to Color's; Hue and Saturation moves both and keeps the brightness.",
    },
    color: {
      kind: "color",
      label: "Color",
      default: [1, 0.55, 0.15, 1],
      description:
        "The ink: what mid-brightness becomes in Tritone, white in Tint, and the hue in the two Hue modes.",
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
${HSV_GLSL}

vec3 ink(vec3 rgb) {
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  if (u_mode == 1) return u_color.rgb * luma;
  if (u_mode == 0)
    return luma < 0.5
      ? mix(vec3(0.0), u_color.rgb, luma * 2.0)
      : mix(u_color.rgb, vec3(1.0), luma * 2.0 - 1.0);
  vec3 hsv = rgb_to_hsv(rgb);
  vec3 target = rgb_to_hsv(u_color.rgb);
  hsv.x = target.x;
  if (u_mode == 3) hsv.y = target.y;
  return hsv_to_rgb(hsv);
}

vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  return premultiply(vec4(mix(c.rgb, ink(c.rgb), u_amount), c.a));
}`,
  create() {
    return {
      update({ params, changed }) {
        const needsHue =
          params.mode === "hue" || params.mode === "hue-saturation";
        const identity =
          params.amount <= 0 || (needsHue && hueOf(params.color) === undefined);
        return { changed, identity };
      },
    };
  },
});
