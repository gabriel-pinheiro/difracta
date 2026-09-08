/**
 * One program draws everything: every vertex is a Surface Space position
 * pushed through the Surface's homography, with clip-space w carrying the
 * projective term so the GPU interpolates `v_uv` perspective-correctly.
 * `u_rect` places sub-rectangles (labels, point markers) inside the Surface.
 */
export const VERTEX_SOURCE = `#version 300 es
in vec2 a_uv;
uniform mat3 u_homography;
uniform vec4 u_rect;
out vec2 v_uv;
out vec2 v_local;

void main() {
  vec2 uv = u_rect.xy + a_uv * u_rect.zw;
  vec3 p = u_homography * vec3(uv, 1.0);
  v_uv = uv;
  v_local = a_uv;
  gl_Position = vec4(2.0 * p.x - p.z, p.z - 2.0 * p.y, 0.0, p.z);
}
`;

export const MODE = { flat: 0, pattern: 1, label: 2, marker: 3 } as const;

/**
 * Modes: flat colour (fills and lines), the calibration pattern, a label
 * texture, a ring marker. Output is premultiplied. The pattern is computed
 * from Surface Space coordinates and their screen-space derivatives, so its
 * lines stay about one pixel wide at any projection and cost no geometry.
 */
export const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_local;
uniform int u_mode;
uniform vec4 u_color;
uniform sampler2D u_mask;
uniform int u_mask_enabled;
uniform sampler2D u_texture;
uniform float u_divisions;
uniform int u_corner;
uniform float u_emphasis;
out vec4 o_color;

// 1 inside a line of half-width w pixels, fading over one pixel.
float line(float distancePx, float w) {
  return 1.0 - smoothstep(w - 0.5, w + 0.5, distancePx);
}

vec3 pattern(vec2 uv) {
  vec2 fw = max(fwidth(uv), vec2(1e-6));
  vec2 cell = abs(fract(uv * u_divisions + 0.5) - 0.5) / (fw * u_divisions);
  float grid = line(min(cell.x, cell.y), 0.6);
  float d1 = abs(uv.x - uv.y) / max(fwidth(uv.x - uv.y), 1e-6);
  float d2 = abs(uv.x + uv.y - 1.0) / max(fwidth(uv.x + uv.y), 1e-6);
  float diagonal = line(min(d1, d2), 0.6);
  vec2 edge = min(uv, 1.0 - uv) / fw;
  float border = line(min(edge.x, edge.y), 2.0);
  vec3 color = vec3(0.09);
  color = mix(color, vec3(0.42), grid);
  color = mix(color, vec3(0.62), diagonal);
  color = mix(color, vec3(1.0), border);
  color *= u_emphasis;
  if (u_corner >= 0) {
    vec2 c = vec2(u_corner == 1 || u_corner == 2 ? 1.0 : 0.0,
                  u_corner >= 2 ? 1.0 : 0.0);
    vec2 d = abs(uv - c);
    float inside = 1.0 - smoothstep(0.05, 0.05 + length(fw), max(d.x, d.y));
    color = mix(color, vec3(1.0, 0.72, 0.2), inside);
  }
  return color;
}

void main() {
  float mask = u_mask_enabled == 1 ? texture(u_mask, v_uv).a : 1.0;
  if (u_mode == 0) {
    o_color = vec4(u_color.rgb * u_color.a, u_color.a) * mask;
  } else if (u_mode == 1) {
    o_color = vec4(pattern(v_uv), 1.0) * mask;
  } else if (u_mode == 2) {
    o_color = texture(u_texture, v_local) * u_color.a;
  } else {
    float r = length(v_local - 0.5);
    float px = abs(r - 0.36) / max(length(fwidth(v_local)), 1e-6);
    float ring = line(px, 1.0);
    o_color = vec4(u_color.rgb * u_color.a, u_color.a) * ring;
  }
}
`;
