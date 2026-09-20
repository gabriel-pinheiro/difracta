import { ARCHITECTURE } from "./architecture-shader.ts";
import { LIGHTING } from "./lighting-shader.ts";

/**
 * The GLSL that puts Cathedral together: the camera ray, what it meets
 * (stone, the wet floor with the rig mirrored in it, or the vault), the
 * haze between, the light the rig scatters into it, and a filmic finish.
 */
const SCENE = `
uniform vec4 u_camera;
uniform vec3 u_camera_turn;

vec3 cathedral_turn(vec3 v, vec3 turn) {
  float cr = cos(turn.z);
  float sr = sin(turn.z);
  v.xy = mat2(cr, sr, -sr, cr) * v.xy;
  float cp = cos(turn.y);
  float sp = sin(turn.y);
  v.yz = mat2(cp, -sp, sp, cp) * v.yz;
  float cy = cos(turn.x);
  float sy = sin(turn.x);
  v.xz = mat2(cy, -sy, sy, cy) * v.xz;
  return v;
}

// Light the architecture gives off itself: Brutalist fins carry a neon strip
// around each slot, in the wash colour, brightening with every kick.
vec3 cathedral_glow(vec3 p) {
  if (u_architecture != 1) return vec3(0.0);
  float px = mod(p.x, CATHEDRAL_AISLE) - 4.5;
  float pz = mod(p.z, CATHEDRAL_BAY) - 2.0;
  float rim = abs(cathedral_rect(vec2(px, p.y - 5.2), vec2(0.26, 3.4)));
  float strip = exp(-rim * 30.0) * step(abs(pz), 0.5);
  return u_washColor.rgb * strip * (0.6 + 1.6 * u_wash);
}

vec3 cathedral_stone(vec3 p, float t) {
  vec3 n = cathedral_normal(p, t);
  // Coursed stone: a dark joint every course, fading out with distance before it aliases.
  float course = abs(fract(p.y * 1.4) - 0.5);
  float joint = (1.0 - smoothstep(0.03, 0.08, course)) * (1.0 - smoothstep(5.0, 16.0, t));
  vec3 albedo = u_stoneColor.rgb * (0.85 + 0.15 * smoothstep(0.0, 9.0, p.y)) * (1.0 - 0.35 * joint);
  return albedo * cathedral_surface_light(p, n, cathedral_occlusion(p, n)) + cathedral_glow(p);
}

// Wet flagstones: dark tiles and water in the joints, a mirror at grazing angles.
vec3 cathedral_floor(vec3 p, vec3 rd, float t, float pixel) {
  vec2 tile = abs(fract(p.xz * 0.5) - 0.5);
  float joint = smoothstep(0.46, 0.5, max(tile.x, tile.y)) * (1.0 - smoothstep(8.0, 26.0, t));
  float stone = 0.7 + 0.3 * hash2(floor(mod(p.xz * 0.5, 128.0)));
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 lit = u_stoneColor.rgb * 0.4 * stone * (1.0 - joint * 0.6) * cathedral_surface_light(p, n, 1.0);
  if (u_quality == 0) return lit;
  vec3 bounce = vec3(rd.x, -rd.y, rd.z);
  float fresnel = 0.06 + 0.94 * pow(1.0 - max(-rd.y, 0.0), 5.0);
  float limit = 40.0;
  vec3 mirrored = vec3(0.0);
  if (u_quality == 2) {
    float hit = cathedral_march(p + n * 0.02, bounce, limit, 28);
    if (hit < limit - 0.01) {
      vec3 q = p + bounce * hit;
      mirrored = u_stoneColor.rgb * cathedral_surface_light(q, cathedral_normal(q, hit), 1.0) * exp(-u_haze * hit);
      limit = hit;
    }
  }
  mirrored += cathedral_lights(p + n * 0.02, bounce, limit, pixel);
  return lit + mirrored * fresnel * mix(0.55, 0.95, joint);
}

vec3 cathedral_fog_color() {
  return vec3(0.03, 0.035, 0.06) * u_ambient * u_dim
    + u_washColor.rgb * u_wash * 0.06
    + vec3(0.9) * u_strobe * 0.5;
}

vec3 cathedral_film(vec3 color, vec2 screen, vec2 pixel) {
  color = color * (2.51 * color + 0.03) / (color * (2.43 * color + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.8));
  color *= 1.0 - 0.18 * dot(screen * 0.5, screen * 0.5);
  return color + (hash2(pixel) - 0.5) / 255.0;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 screen = (uv - 0.5) * vec2(aspect, -1.0) * 2.0;
  vec3 ro = u_camera.xyz;
  vec3 rd = cathedral_turn(normalize(vec3(screen * u_camera.w, 1.0)), u_camera_turn);
  float pixel = 2.0 * u_camera.w / max(u_resolution.y, 1.0);
  float to_floor = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float to_vault = rd.y > 1e-4 ? (cathedral_ceiling() - ro.y) / rd.y : 1e5;
  float far = min(min(to_floor, to_vault), CATHEDRAL_FAR);
  float t = cathedral_march(ro, rd, far, cathedral_steps());
  vec3 p = ro + rd * t;
  vec3 color = vec3(0.0);
  if (t < far - 0.01) color = cathedral_stone(p, t);
  else if (to_floor <= far) color = cathedral_floor(p, rd, t, pixel);
  else if (to_vault <= far) color = u_stoneColor.rgb * 0.5 * cathedral_surface_light(p, vec3(0.0, -1.0, 0.0), 0.8);
  float transmit = exp(-u_haze * t) * (1.0 - smoothstep(CATHEDRAL_FAR * 0.55, CATHEDRAL_FAR, t));
  color = color * transmit + cathedral_fog_color() * (1.0 - transmit);
  color += cathedral_lights(ro, rd, t, pixel);
  return vec4(cathedral_film(color, screen, uv * u_resolution), 1.0);
}
`;

export const CATHEDRAL_FRAGMENT = `${ARCHITECTURE}${LIGHTING}${SCENE}`;
