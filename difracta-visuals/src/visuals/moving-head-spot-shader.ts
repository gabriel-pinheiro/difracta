/**
 * The GLSL of Moving Head Spot, in the pieces a fixture has: the figures
 * the beam travels, the gobo fields stencilled into it and the prism that
 * multiplies it. Each choice is dispatched on its option index, in the
 * order the definition lists the options.
 */

export const TRAVEL_FIGURES = `
const float TAU = 6.283185307179586;

vec2 head_rotate(vec2 point, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * point;
}

float head_ease(float value) {
  return value * value * (3.0 - 2.0 * value);
}

vec2 head_triangle(float progress) {
  float position = fract(progress) * 3.0;
  float along = head_ease(fract(position));
  if (position < 1.0) return mix(vec2(0.0, -1.0), vec2(1.0, 1.0), along);
  if (position < 2.0) return mix(vec2(1.0, 1.0), vec2(-1.0, 1.0), along);
  return mix(vec2(-1.0, 1.0), vec2(0.0, -1.0), along);
}

// Where the beam is at progress along its figure, in a -1..1 square.
vec2 head_figure(float progress) {
  float angle = progress * TAU;
  vec2 orbit = vec2(cos(angle), sin(angle));
  if (u_figure == 0) return orbit;
  if (u_figure == 1) return vec2(sin(angle), sin(angle * 2.0));
  if (u_figure == 2) return vec2(cos(angle), 0.0);
  if (u_figure == 3) return vec2(0.0, cos(angle));
  if (u_figure == 4) return vec2(cos(angle));
  if (u_figure == 5) {
    vec2 diamond = orbit / max(abs(orbit.x) + abs(orbit.y), 0.000001);
    return mix(diamond, orbit, 0.12);
  }
  if (u_figure == 6) {
    float scale = pow(pow(abs(orbit.x), 6.0) + pow(abs(orbit.y), 6.0), -1.0 / 6.0);
    return orbit * scale;
  }
  if (u_figure == 7) return head_triangle(progress);
  if (u_figure == 8) return orbit * cos(angle * 2.0);
  if (u_figure == 9) {
    float cycle = fract(progress);
    float radius = 0.5 - 0.5 * cos(TAU * cycle);
    float turn = TAU * 3.0 * cycle;
    return vec2(cos(turn), sin(turn)) * radius;
  }
  vec2 wander = vec2(
    sin(angle) * 0.58 + sin(angle * 2.0 + 1.3) * 0.27 + sin(angle * 5.0 + 0.2) * 0.15,
    sin(angle + 0.9) * 0.62 + sin(angle * 3.0 + 2.4) * 0.25 + sin(angle * 6.0) * 0.13
  );
  return clamp(wander, vec2(-1.0), vec2(1.0));
}`;

export const GOBOS = `
float head_box(vec2 point, vec2 half_size) {
  vec2 to_box = abs(point) - half_size;
  return -(length(max(to_box, vec2(0.0))) + min(max(to_box.x, to_box.y), 0.0));
}

// Positive inside the lit parts of the gobo, in beam-radius units, never
// outside the aperture.
float head_gobo_field(vec2 point) {
  float radius = length(point);
  float aperture = 1.0 - radius;
  if (u_gobo == 0) return aperture;
  if (u_gobo == 1) return min(radius - 0.48, 0.82 - radius);
  if (u_gobo == 2) {
    float dots = 0.2 - radius;
    for (int index = 0; index < 5; index += 1) {
      float angle = TAU * float(index) / 5.0;
      dots = max(dots, 0.2 - length(point - vec2(cos(angle), sin(angle)) * 0.56));
    }
    return min(aperture, dots);
  }
  if (u_gobo == 3) {
    float bars = head_box(point - vec2(-0.55, 0.0), vec2(0.11, 0.78));
    bars = max(bars, head_box(point, vec2(0.11, 0.9)));
    bars = max(bars, head_box(point - vec2(0.55, 0.0), vec2(0.11, 0.78)));
    return min(aperture, bars);
  }
  float angle = atan(point.y, point.x);
  if (u_gobo == 4) {
    float boundary = mix(0.42, 0.92, smoothstep(-0.35, 0.8, cos(angle * 5.0)));
    return min(aperture, boundary - radius);
  }
  if (u_gobo == 5) return min(aperture, sin(angle * 6.0 + radius * 8.0) * 0.18 + 0.025);
  if (u_gobo == 6) return min(aperture, cos(angle * 2.0 - radius * TAU * 2.6) * 0.18 - 0.015);
  float breakup = sin(point.x * 8.0 + sin(point.y * 5.0) * 1.7) * sin(point.y * 10.0 - point.x * 2.5)
    + sin((point.x + point.y) * 13.0) * 0.32;
  return min(aperture, breakup * 0.16 - 0.015);
}

float head_gobo_mask(vec2 point, float radius, float angle) {
  vec2 local = head_rotate(point, -angle) / max(radius, 0.000001);
  float field = head_gobo_field(local);
  float antialias = max(fwidth(field) * 1.35, 0.0005);
  float focus_width = mix(0.22, 0.008, u_focus * u_focus);
  float mask = smoothstep(0.0, max(antialias, focus_width), field);
  float profile = mix(1.0, 0.88, smoothstep(0.0, 1.0, length(local)));
  return mask * profile;
}`;

export const PRISMS = `
int head_facets() {
  if (u_prism == 0) return 1;
  if (u_prism == 1) return 3;
  if (u_prism == 2) return 5;
  if (u_prism == 3 || u_prism == 4) return 6;
  return 8;
}

bool head_prism_linear() {
  return u_prism == 2 || u_prism == 4;
}

vec2 head_facet_offset(int facet, int facets, float spread, float angle) {
  if (facets <= 1) return vec2(0.0);
  if (head_prism_linear()) {
    float along = float(facet) / float(facets - 1);
    return head_rotate(vec2(mix(-spread, spread, along), 0.0), angle);
  }
  float facet_angle = angle + TAU * float(facet) / float(facets);
  return vec2(cos(facet_angle), sin(facet_angle)) * spread;
}`;

export const BEAM = `
uniform float u_progress;
// The gobo's and the prism's whole rotation in radians: their Angle
// Parameter plus the turns their Spin has made.
uniform float u_gobo_turn;
uniform float u_prism_turn;

vec4 render_visual(vec2 uv) {
  float shortest = max(1.0, min(u_resolution.x, u_resolution.y));
  float beam_radius = u_zoom * 0.5;
  float spread = u_prism == 0 ? 0.0 : u_prismSpread;
  if (u_keepVisible) spread = min(spread, max(0.0, 0.5 - beam_radius));
  vec2 footprint = (beam_radius + spread) * shortest / max(u_resolution, vec2(1.0));
  vec2 amplitude = u_keepVisible ? max(vec2(0.0), vec2(0.5) - footprint) : vec2(0.5);
  vec2 center = vec2(0.5) + head_figure(u_progress) * amplitude;
  vec2 point = (uv - center) * u_resolution / shortest;

  int facets = head_facets();
  float beam = 0.0;
  for (int facet = 0; facet < 8; facet += 1) {
    if (facet >= facets) break;
    vec2 facet_point = point - head_facet_offset(facet, facets, spread, u_prism_turn);
    if (dot(facet_point, facet_point) <= beam_radius * beam_radius)
      beam += head_gobo_mask(facet_point, beam_radius, u_gobo_turn);
  }
  return vec4(u_color.rgb, u_color.a * clamp(beam, 0.0, 1.0));
}`;
