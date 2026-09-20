import { GEOMETRY_SHADER } from "./geometry-shader.ts";
import { LIGHTING_SHADER } from "./lighting-shader.ts";

export const MONOLITH_FRAGMENT = `${GEOMETRY_SHADER}${LIGHTING_SHADER}
uniform vec3 u_view;
uniform vec3 u_jolt;

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 screen = (uv - 0.5) * vec2(aspect, -1.0);
  float c = cos(u_jolt.z);
  float s = sin(u_jolt.z);
  screen = mat2(c, s, -s, c) * screen + u_jolt.xy;
  // A narrow pillar retains the expanded assembly rather than cropping its sides.
  float distance = u_cameraDistance * max(1.0, 0.72 / aspect);
  vec3 eye = normalize(u_view) * distance;
  vec3 forward = normalize(-eye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 ray = normalize(forward * 1.65 + right * screen.x + up * screen.y);
  float pixel = 1.0 / (u_resolution.y * 1.65);
  MonolithHit hit = mono_trace(eye, ray, pixel);
  vec3 color = vec3(0.0);
  float limit = hit.travel;
  // The core is real geometry, so closed slabs hide it and open ones reveal it.
  vec2 spine = mono_bounds(eye, ray, vec3(0.032, 1.85 + u_opening * 0.55, 0.032));
  if (spine.y > max(spine.x, 0.0) && spine.x < limit) {
    vec3 p = eye + ray * spine.x;
    float cells = 0.65 + 0.35 * smoothstep(0.15, 0.3, abs(fract(p.y * 7.0) - 0.5));
    float solo = exp(-pow((p.y - (u_scan - 0.5) * 4.0) * 2.0, 2.0));
    color = mono_core_color() * (2.0 + u_charge * 4.0) * cells * mix(1.0, solo * 0.25, u_solo)
      + vec3(u_flash * 4.0);
    limit = spine.x;
  } else if (hit.slab >= 0) color = mono_metal(hit, eye, ray);
  color += mono_haze(eye, ray, limit);
  // A Drop's brief expanding annulus dissipates; the open assembly stays behind.
  float ring = abs(length(screen * vec2(1.0, 1.6)) - (1.0 - u_impact) * 1.1);
  float shock = exp(-ring * 100.0) * u_impact * u_opening;
  color += mono_core_color() * shock * u_glow * 0.35;
  color = pow(1.0 - exp(-color * 1.5), vec3(0.85));
  return vec4(color, 1.0);
}
`;
