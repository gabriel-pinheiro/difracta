/**
 * What the Visuals showing a picture share. `FIT_PARAMETER` and `FIT_GLSL`
 * are the Fit alone: Stretch maps the picture onto the whole Surface; Cover
 * scales it to fill the Surface, cropping the axis that overflows; Contain
 * scales it to fit inside, leaving the rest transparent. Both ratios come
 * from `u_resolution` (the Surface in frame pixels) and the picture's size,
 * so the Fit follows the mapping. Image and Video add the Tint and sample
 * `u_media` whole (`MEDIA_FIT_PARAMETERS`, `MEDIA_FIT_FRAGMENT`): the
 * result is straight alpha times the Tint; the engine premultiplies.
 */
export const FIT_PARAMETER = {
  kind: "choice",
  label: "Fit",
  default: "cover",
  options: [
    { value: "stretch", label: "Stretch" },
    { value: "cover", label: "Cover" },
    { value: "contain", label: "Contain" },
  ],
  description:
    "Cover keeps the picture's shape and crops what overflows; Contain keeps the shape and leaves the rest clear; Stretch fills the Surface whatever the picture's shape.",
} as const;

export const MEDIA_FIT_PARAMETERS = {
  tint: {
    kind: "color",
    label: "Tint",
    default: [1, 1, 1, 1],
    description:
      "Multiplies the picture: white shows it as it is, a color paints a white-on-black picture that color.",
  },
  fit: FIT_PARAMETER,
} as const;

/** `fit_uv`: where in a picture of `size` pixels the Surface's uv falls under the Fit (0 stretch, 1 cover, 2 contain). */
export const FIT_GLSL = `
vec2 fit_uv(vec2 uv, vec2 size) {
  if (u_fit == 0 || size.x <= 0.0 || size.y <= 0.0) return uv;
  float picture = size.x / size.y;
  float surface = u_resolution.x / u_resolution.y;
  float ratio = picture / surface;
  bool wider = ratio > 1.0;
  vec2 scale = (u_fit == 1) == wider ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio);
  return (uv - 0.5) * scale + 0.5;
}

bool outside_picture(vec2 p) {
  return any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(1.0)));
}`;

export const MEDIA_FIT_FRAGMENT = `
uniform sampler2D u_media;
uniform vec2 u_media_size;
${FIT_GLSL}

vec4 sample_media(vec2 uv) {
  vec2 p = fit_uv(uv, u_media_size);
  if (outside_picture(p)) return vec4(0.0);
  return texture(u_media, p) * u_tint;
}

vec4 render_visual(vec2 uv) {
  return sample_media(uv);
}`;
