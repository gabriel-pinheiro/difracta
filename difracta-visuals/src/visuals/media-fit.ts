/**
 * What Image and Video share: the Tint and Fit Parameters and the GLSL
 * that samples `u_media` through the Fit. Stretch maps the picture onto
 * the whole Surface; Cover scales it to fill the Surface, cropping the
 * axis that overflows; Contain scales it to fit inside, leaving the rest
 * transparent. Both ratios come from `u_resolution` (the Surface in frame
 * pixels) and `u_media_size` (the picture), so the Fit follows the
 * mapping. The result is straight alpha times the Tint; the engine
 * premultiplies.
 */
export const MEDIA_FIT_PARAMETERS = {
  tint: {
    kind: "color",
    label: "Tint",
    default: [1, 1, 1, 1],
    description:
      "Multiplies the picture: white shows it as it is, a color paints a white-on-black picture that color.",
  },
  fit: {
    kind: "choice",
    label: "Fit",
    default: "stretch",
    options: [
      { value: "stretch", label: "Stretch" },
      { value: "cover", label: "Cover" },
      { value: "contain", label: "Contain" },
    ],
    description:
      "Stretch fills the Surface whatever the picture's shape; Cover keeps the shape and crops; Contain keeps the shape and leaves the rest clear.",
  },
} as const;

export const MEDIA_FIT_FRAGMENT = `
uniform sampler2D u_media;
uniform vec2 u_media_size;

// The picture's uv for the Surface's uv under the Fit (0 stretch, 1 cover, 2 contain).
vec2 media_uv(vec2 uv) {
  if (u_fit == 0 || u_media_size.x <= 0.0 || u_media_size.y <= 0.0) return uv;
  float picture = u_media_size.x / u_media_size.y;
  float surface = u_resolution.x / u_resolution.y;
  float ratio = picture / surface;
  bool wider = ratio > 1.0;
  vec2 scale = (u_fit == 1) == wider ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio);
  return (uv - 0.5) * scale + 0.5;
}

vec4 sample_media(vec2 uv) {
  vec2 p = media_uv(uv);
  if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(1.0)))) return vec4(0.0);
  return texture(u_media, p) * u_tint;
}

vec4 render_visual(vec2 uv) {
  return sample_media(uv);
}`;
