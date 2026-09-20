import { MAX_BEAMS, MAX_LASERS } from "./fixtures.ts";

/**
 * The GLSL of Cathedral's light: what the rig's beams and lasers scatter
 * out of the haze along a view ray, in closed form per fixture from the
 * ray's closest approach to its axis rather than by marching the fog, the
 * lamp heads themselves, and the light falling on stone (ambient, the
 * uplight wash, beam spots and the strobe bank).
 */
export const LIGHTING = `
uniform vec4 u_beam_origins[${String(MAX_BEAMS)}];
uniform vec4 u_beam_dirs[${String(MAX_BEAMS)}];
uniform float u_beam_count;
uniform vec3 u_laser_origin;
uniform vec4 u_laser_dirs[${String(MAX_LASERS)}];
uniform float u_laser_count;
uniform float u_wash;
uniform float u_wash_chase;
uniform float u_strobe;
uniform float u_haze;
uniform float u_dim;

const float CATHEDRAL_REACH = 56.0;
const float CATHEDRAL_SPREAD = 0.05;

vec3 cathedral_beam_color(float tint) {
  return mix(u_beamColorA.rgb, u_beamColorB.rgb, tint);
}

// How far a light travels before the floor, the vault or its reach stops it.
float cathedral_light_end(vec3 origin, vec3 direction) {
  float end = CATHEDRAL_REACH;
  if (direction.y < -0.001) end = min(end, origin.y / -direction.y);
  if (direction.y > 0.001) end = min(end, (cathedral_ceiling() - origin.y) / direction.y);
  return end;
}

// The closest approach of the view segment [0, limit] to a light segment
// [0, end]: the gap, the view distance, the light distance and the sine
// of the angle they cross at.
vec4 cathedral_approach(vec3 ro, vec3 rd, float limit, vec3 origin, vec3 direction, float end) {
  vec3 w = ro - origin;
  float b = dot(rd, direction);
  float d = dot(rd, w);
  float e = dot(direction, w);
  float denom = max(1.0 - b * b, 1e-4);
  float t = clamp((b * e - d) / denom, 0.0, limit);
  float s = clamp(e + t * b, 0.0, end);
  t = clamp(s * b - d, 0.0, limit);
  float gap = length(ro + rd * t - origin - direction * s);
  return vec4(gap, t, s, sqrt(denom));
}

vec3 cathedral_beam_haze(vec3 ro, vec3 rd, float limit, int index) {
  vec4 origin = u_beam_origins[index];
  vec4 direction = u_beam_dirs[index];
  if (origin.w <= 0.0) return vec3(0.0);
  float end = cathedral_light_end(origin.xyz, direction.xyz);
  vec4 a = cathedral_approach(ro, rd, limit, origin.xyz, direction.xyz, end);
  float width = 0.1 + a.z * CATHEDRAL_SPREAD;
  // A Gaussian tube crossed at an angle holds its width over that sine.
  float crossing = width * 1.7725 / max(a.w, 0.35);
  float gap2 = a.x * a.x / (width * width);
  float shaft = exp(-gap2) + exp(-gap2 / 9.0) * 0.18;
  float along = smoothstep(CATHEDRAL_REACH, CATHEDRAL_REACH * 0.5, a.z) / (1.0 + a.z * 0.05);
  float haze = shaft * crossing * along * exp(-u_haze * a.y) * (0.25 + u_haze * 22.0);
  vec3 toward = origin.xyz - ro;
  float distance = dot(toward, rd);
  float lamp = 0.0;
  if (distance > 0.0 && distance < limit + 0.5) {
    float angle = length(toward - rd * distance) / distance;
    float facing = pow(max(dot(direction.xyz, -normalize(toward)), 0.0), 16.0);
    lamp = (exp(-angle * angle * 6000.0) * 1.5 + exp(-angle * angle * 250.0) * 0.12)
      * (0.25 + facing * 4.0) * exp(-u_haze * distance);
  }
  return cathedral_beam_color(direction.w) * origin.w * (haze * 0.9 + lamp);
}

vec3 cathedral_laser_haze(vec3 ro, vec3 rd, float limit, int index, float pixel) {
  vec4 laser = u_laser_dirs[index];
  if (laser.w <= 0.0) return vec3(0.0);
  float end = cathedral_light_end(u_laser_origin, laser.xyz);
  vec4 a = cathedral_approach(ro, rd, limit, u_laser_origin, laser.xyz, end);
  // About a pixel and a bit wide wherever it is, so a laser stays a hairline.
  float width = max(pixel * a.y * 1.3, 0.006);
  float line = exp(-a.x * a.x / (width * width)) + exp(-a.x * a.x / 0.05) * 0.06;
  return u_laserColor.rgb * laser.w * line * exp(-u_haze * a.y) * (0.6 + u_haze * 10.0);
}

vec3 cathedral_lights(vec3 ro, vec3 rd, float limit, float pixel) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${String(MAX_BEAMS)}; i += 1) {
    if (float(i) >= u_beam_count) break;
    sum += cathedral_beam_haze(ro, rd, limit, i);
  }
  for (int i = 0; i < ${String(MAX_LASERS)}; i += 1) {
    if (float(i) >= u_laser_count) break;
    sum += cathedral_laser_haze(ro, rd, limit, i, pixel);
  }
  vec3 toward = u_laser_origin - ro;
  float distance = dot(toward, rd);
  if (u_laser_count > 0.0 && distance > 0.0 && distance < limit + 1.0) {
    float angle = length(toward - rd * distance) / distance;
    sum += u_laserColor.rgb * u_laser_dirs[0].w * exp(-angle * angle * 4000.0) * 1.2;
  }
  return sum;
}

vec3 cathedral_surface_light(vec3 p, vec3 n, float occlusion) {
  vec3 light = vec3(0.16, 0.19, 0.28) * u_ambient * u_dim * (0.55 + 0.45 * n.y) * occlusion;
  // Uplights at every pillar foot, brightest low, a chase stepping a row per kick.
  float row = floor(p.z / CATHEDRAL_BAY + 0.5);
  float chase = 0.5 + 0.5 * cos(1.5707963 * (row - u_wash_chase));
  light += u_washColor.rgb * u_wash * 0.7 * exp(-p.y * 0.38) * (0.15 + 0.85 * chase) * (0.6 + 0.4 * occlusion);
  for (int i = 0; i < ${String(MAX_BEAMS)}; i += 1) {
    if (float(i) >= u_beam_count) break;
    vec4 origin = u_beam_origins[i];
    vec4 direction = u_beam_dirs[i];
    if (origin.w <= 0.0) continue;
    vec3 color = cathedral_beam_color(direction.w) * origin.w;
    vec3 offset = p - origin.xyz;
    // The lamp head lights the stone around it: the vault and capitals near the rig.
    float near = dot(offset, offset);
    light += color * 2.0 / (1.0 + near * 0.6) * (0.5 - 0.5 * dot(n, offset) / sqrt(near + 1e-4));
    // A spot lands where the beam stops, not on everything along its axis.
    float s = dot(offset, direction.xyz);
    if (s <= 0.0 || s > cathedral_light_end(origin.xyz, direction.xyz) + 0.5) continue;
    float width = 0.1 + s * CATHEDRAL_SPREAD;
    float gap2 = dot(offset, offset) - s * s;
    float spread = 1.0 / (1.0 + s * 0.1);
    float spot = exp(-gap2 / (width * width)) * max(dot(n, -direction.xyz), 0.0) * 1.6;
    // Stone beside a shaft picks up its colour from the lit haze.
    float spill = exp(-gap2 / (8.0 * width * width)) * 0.07;
    light += color * (spot + spill) * spread;
  }
  return light + vec3(1.0, 0.97, 0.92) * u_strobe * 1.4;
}
`;
