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

/** The HSV saturation of a colour, from 0 for a grey to 1 for a pure hue. */
export function saturationOf(color: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = color;
  const max = Math.max(r, g, b);
  return max < 1e-6 ? 0 : (max - Math.min(r, g, b)) / max;
}

export const hueShift = defineFilter({
  id: "hue-shift",
  name: "Hue Shift",
  description:
    "Carries the picture from one colour to another: every hue turns by the angle between them and saturation scales in their ratio, keeping brightness.",
  notes:
    "A recolour set by two colours instead of an angle and an amount: the picture turns around the colour wheel by however far From's hue is from To's, and its saturation scales by however much more or less saturated To is than From, with brightness untouched, so a red clip with orange highlights becomes a blue clip with violet highlights, and the same clip with To at a pale blue becomes a pale blue clip. The whole clip turns by that one angle and scales by that one ratio, so only the From colour lands exactly on To and every other colour keeps its distance from it; a clip of many hues keeps its spread, and its paler parts stay paler than the rest. Set From to the clip's main colour and link To to one Color Controller on every treated Layer, and clips of different colours all land on that colour together, which is the point of the two-colour form. A To with no saturation, white, grey or black, is the end of that road: the clip loses all its colour and keeps its brightness, so a pure red goes to white and a dark red to grey, and a Controller sweeping from red through pink to white drains the clip smoothly along the way. A From with no saturation has no hue to measure from, and the pass is skipped, as it is when From and To have the same hue and saturation. Greys in the picture stay grey. It works in straight alpha. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, on one clip; at the root it turns the whole frame. Stack Adjust over it to set brightness afterwards, or Colorize instead when the clip should be one ink rather than its own colours moved.",
  parameters: {
    from: {
      kind: "color",
      label: "From",
      default: [1, 0, 0, 1],
      description: "The clip's own colour; it is the one that lands on To.",
    },
    to: {
      kind: "color",
      label: "To",
      default: [0.2, 0.4, 1, 1],
      description:
        "Where From goes, in hue and saturation; link it to a Color Controller.",
    },
  },
  fragment: `
uniform float u_shift;
uniform float u_saturation;

${HSV_GLSL}

vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  vec3 hsv = rgb_to_hsv(c.rgb);
  hsv.x = fract(hsv.x + u_shift);
  hsv.y = min(hsv.y * u_saturation, 1.0);
  return premultiply(vec4(hsv_to_rgb(hsv), c.a));
}`,
  create() {
    return {
      update({ params, changed }) {
        const from = hueOf(params.from);
        const to = hueOf(params.to);
        const fromSaturation = saturationOf(params.from);
        // A From with no hue measures nothing; a To with none still drains the colour.
        const shift =
          from === undefined || to === undefined
            ? 0
            : (((to - from) % 1) + 1) % 1;
        const saturation =
          from === undefined ? 1 : saturationOf(params.to) / fromSaturation;
        const identity =
          from === undefined ||
          (shift < 1e-6 && Math.abs(saturation - 1) < 1e-6);
        return { changed, identity, uniforms: { shift, saturation } };
      },
    };
  },
});
