import { defineFilter } from "@difracta/render/sdk";
import { HSV_GLSL } from "./hsv-glsl.ts";

/** The hue of a colour as a turn from 0 to 1; undefined for a grey, which has none. */
export function hueOf(color: readonly number[]): number | undefined {
  const [r = 0, g = 0, b = 0] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma < 1e-6) return undefined;
  const sector =
    max === r
      ? (g - b) / chroma
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return (((sector / 6) % 1) + 1) % 1;
}

export const hueShift = defineFilter({
  id: "hue-shift",
  name: "Hue Shift",
  description:
    "Turns every hue in the picture by the angle from one colour to another, keeping saturation and brightness.",
  notes:
    "A hue rotation set by two colours instead of an angle: the picture turns around the colour wheel by however far From's hue is from To's, with saturation and brightness untouched, so a red clip with orange highlights becomes a blue clip with violet highlights. The whole clip turns by that one angle, so only the From hue lands exactly on To and every other hue keeps its distance from it; a clip of many hues keeps its spread. Set From to the clip's main colour and link To to one Color Controller on every treated Layer, and clips of different colours all land on that colour together, which is the point of the two-colour form. A From or To with no saturation, grey, black or white, has no hue, and the pass is skipped, as it is when the two hues are the same. Greys in the picture stay grey. It works in straight alpha. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, on one clip; at the root it turns the whole frame. Stack Adjust over it to set saturation afterwards, or Colorize instead when the clip should be one ink rather than its own hues moved.",
  parameters: {
    from: {
      kind: "color",
      label: "From",
      default: [1, 0, 0, 1],
      description:
        "The clip's own colour; its hue is the one that lands on To.",
    },
    to: {
      kind: "color",
      label: "To",
      default: [0.2, 0.4, 1, 1],
      description: "Where From's hue goes; link it to a Color Controller.",
    },
  },
  fragment: `
uniform float u_shift;

${HSV_GLSL}

vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  vec3 hsv = rgb_to_hsv(c.rgb);
  hsv.x = fract(hsv.x + u_shift);
  return premultiply(vec4(hsv_to_rgb(hsv), c.a));
}`,
  create() {
    return {
      update({ params, changed }) {
        const from = hueOf(params.from);
        const to = hueOf(params.to);
        const shift =
          from === undefined || to === undefined
            ? 0
            : (((to - from) % 1) + 1) % 1;
        return { changed, identity: shift < 1e-6, uniforms: { shift } };
      },
    };
  },
});
