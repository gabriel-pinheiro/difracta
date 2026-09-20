/**
 * The GLSL of Liquid Chrome's sculpture: the forms it morphs between, as
 * signed distances about a unit radius, and the scene that turns and
 * blends two of them, keeps the surface alive, ripples and spikes it on a
 * Kick and pools the Shatter droplets into it. Form indices follow
 * `FORM_OPTIONS`; satellites, droplets and axes arrive from `sculpture.ts`.
 */
export const FORMS_SHADER = `
const float TAU = 6.2831853;

float chrome_smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

mat2 chrome_turn(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

// Mercury: a core and satellites circling in and out of it, pooling as they meet.
float form_mercury(vec3 p) {
  float k = 0.1 + u_viscosity * 0.4;
  float d = length(p) - 0.5;
  for (int i = 0; i < SATELLITES; i += 1)
    d = chrome_smin(d, length(p - u_satellites[i].xyz) - u_satellites[i].w, k);
  return d;
}

// Stood upright, so its hole faces the camera as it orbits.
float form_torus(vec3 p) {
  float around = atan(p.y, p.x);
  vec2 q = vec2(length(p.xy) - 0.78, p.z + 0.09 * sin(around * 3.0 + u_time * 1.4));
  return (length(q) - 0.3) * 0.9;
}

// Spikes along the three axes and the four diagonals, as long as Spikiness says.
float form_urchin(vec3 p) {
  float r = length(p);
  vec3 a = abs(p) / max(r, 0.0001);
  float axes = pow(max(a.x, max(a.y, a.z)), 28.0);
  float diagonals = pow(dot(a, vec3(0.57735)), 40.0);
  return (r - 0.6 - (0.15 + 0.55 * u_spikiness) * max(axes, diagonals)) * 0.55;
}

// A ball carved into a gyroid lattice; Viscosity thickens its walls.
float form_gyroid(vec3 p) {
  vec3 q = p * 4.2;
  float sheet = abs(dot(sin(q), cos(q.yzx))) / 4.2 - (0.045 + 0.05 * u_viscosity);
  return max(length(p) - 0.95, sheet * 0.7);
}

// A flat band bent into a ring and twisted one and a half times around it.
float form_twisted_ring(vec3 p) {
  float around = atan(p.z, p.x);
  vec2 q = vec2(length(p.xz) - 0.74, p.y);
  q = chrome_turn(around * 1.5 + u_time * 0.5) * q;
  vec2 box = abs(q) - vec2(0.3, 0.09);
  return (length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - 0.05) * 0.8;
}

float chrome_form(float index, vec3 p) {
  if (index < 0.5) return form_mercury(p);
  if (index < 1.5) return form_torus(p);
  if (index < 2.5) return form_urchin(p);
  if (index < 3.5) return form_gyroid(p);
  return form_twisted_ring(p);
}

// The whole sculpture: two forms blended and turned, a living surface, droplets out.
float chrome_scene(vec3 p) {
  vec3 o = mat3(u_axis_x, u_axis_y, u_axis_z) * p;
  float core = 1.0 - 0.72 * u_shatter;
  vec3 q = o / core;
  float d = chrome_form(u_form_a, q);
  if (u_morph > 0.0) d = mix(d, chrome_form(u_form_b, q), u_morph);
  d *= core;
  float wobble = sin(o.x * 3.1 + u_time * 1.7) * sin(o.y * 2.7 - u_time * 1.3)
    * sin(o.z * 3.3 + u_time);
  d -= wobble * (0.015 + 0.06 * u_energy);
  if (u_kick > 0.002) {
    float r = length(o);
    float ripple = sin(r * 14.0 - u_ripple * 20.0) * exp(-u_ripple * 3.0);
    vec3 a = abs(o) / max(r, 0.0001);
    float spikes = pow(max(a.x, max(a.y, a.z)), 18.0);
    d -= u_kick * (ripple * (0.025 + 0.04 * u_energy) + spikes * u_spikiness * 0.3);
  }
  if (u_shatter > 0.0) {
    float k = 0.04 + 0.3 * u_viscosity * u_shatter;
    for (int i = 0; i < DROPLETS; i += 1)
      d = chrome_smin(d, length(p - u_droplets[i].xyz) - u_droplets[i].w, k);
  }
  return d;
}
`;
