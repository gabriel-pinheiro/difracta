/**
 * The GLSL that films Liquid Chrome: an orbiting, shaking camera marches
 * each pixel's ray into the sculpture's bounding sphere, shades a hit as
 * metal reflecting the studio (thin-film colour, Fresnel, occlusion, and
 * at High its own reflection), keeps the closest miss for a soft
 * silhouette and a halo, and lays a floor under it with a pool of light
 * and, from Medium, the sculpture's reflection. Quality is dispatched on
 * its option index.
 */
export const SHADING_SHADER = `
const float FOCAL = 1.8;
const float FLOOR = -1.45;
const int MAX_STEPS = 96;

struct ChromeHit {
  bool hit;
  // Where along the ray it hit, or came closest.
  float at;
  float closest;
};

int chrome_steps() {
  return u_quality == 0 ? 36 : (u_quality == 1 ? 64 : 96);
}

vec3 chrome_normal(vec3 p, float epsilon) {
  vec2 e = vec2(1.0, -1.0) * epsilon;
  return normalize(
    e.xyy * chrome_scene(p + e.xyy) + e.yyx * chrome_scene(p + e.yyx)
    + e.yxy * chrome_scene(p + e.yxy) + e.xxx * chrome_scene(p + e.xxx));
}

// Where a ray enters and leaves the sphere the sculpture stays inside; y < 0 misses.
vec2 chrome_bounds(vec3 origin, vec3 ray) {
  float radius = 1.9 + 1.6 * u_shatter;
  float b = dot(origin, ray);
  float c = dot(origin, origin) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(max(0.0, -b - h), -b + h);
}

// Sphere-traces up to steps, hitting within pixel (an angle) times the distance.
ChromeHit chrome_march(vec3 origin, vec3 ray, int steps, float pixel) {
  ChromeHit result = ChromeHit(false, 0.0, 1e5);
  vec2 span = chrome_bounds(origin, ray);
  if (span.y < 0.0) return result;
  float travel = span.x;
  for (int i = 0; i < MAX_STEPS; i += 1) {
    if (i >= steps || travel > span.y) break;
    float d = chrome_scene(origin + ray * travel);
    if (d < result.closest) {
      result.closest = d;
      result.at = travel;
    }
    if (d < max(0.0008, pixel * travel)) {
      result.hit = true;
      result.at = travel;
      result.closest = 0.0;
      break;
    }
    travel += d * 0.75;
  }
  return result;
}

vec3 chrome_metal(vec3 p, vec3 ray, float footprint) {
  vec3 n = chrome_normal(p, clamp(footprint, 0.0008, 0.02));
  float facing = clamp(dot(n, -ray), 0.0, 1.0);
  vec3 bounce = reflect(ray, n);
  vec3 reflected = chrome_environment(bounce);
  if (u_quality == 2) {
    vec3 start = p + n * 0.03;
    ChromeHit mirror = chrome_march(start, bounce, 28, 0.004);
    if (mirror.hit) {
      vec3 seen = start + bounce * mirror.at;
      reflected = chrome_environment(reflect(bounce, chrome_normal(seen, 0.004))) * 0.75;
    }
  }
  float fresnel = 0.62 + 0.38 * pow(1.0 - facing, 5.0);
  vec3 film = 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.33, 0.67) + facing * 1.7
    + dot(n, vec3(0.25, 0.55, 0.15))));
  vec3 tint = mix(u_metalColor.rgb, u_metalColor.rgb * film * 1.5, u_iridescence);
  float occlusion = u_quality == 0 ? 1.0 : clamp(chrome_scene(p + n * 0.15) / 0.15, 0.3, 1.0);
  vec3 color = reflected * tint * fresnel * occlusion;
  vec3 rim = mix(u_lightColorA.rgb, u_lightColorB.rgb, 0.5 + 0.5 * n.y);
  color += rim * pow(1.0 - facing, 3.0) * (0.3 + 0.9 * u_kick) * occlusion;
  return color;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 screen = (uv - 0.5) * vec2(aspect, -1.0);
  screen = chrome_turn(u_camera_shake.z) * screen + u_camera_shake.xy;
  float yaw = u_orbit * TAU;
  float pitch = 0.2 + 0.06 * sin(u_time * 0.23);
  vec3 eye = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * u_cameraDistance;
  vec3 forward = normalize(-eye);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 ray = normalize(forward * FOCAL + right * screen.x + up * screen.y);
  float pixel = 1.0 / (u_resolution.y * FOCAL);
  vec3 glow_color = mix(u_lightColorA.rgb, u_lightColorB.rgb, 0.5 + 0.5 * sin(u_lights * TAU * 2.0))
    * (1.0 + 1.5 * u_kick) + vec3(u_flash);

  ChromeHit hit = chrome_march(eye, ray, chrome_steps(), pixel);
  float cover = hit.hit ? 1.0 : clamp(1.0 - hit.closest / max(pixel * hit.at * 1.5, 1e-5), 0.0, 1.0);
  vec3 metal = cover > 0.0 ? chrome_metal(eye + ray * hit.at, ray, pixel * hit.at) : vec3(0.0);
  float halo = hit.hit ? 0.0 : exp(-max(hit.closest, 0.0) * 7.0) * u_glow * 0.45;

  vec3 behind = (u_background.rgb + chrome_environment(ray) * 0.02) * u_background.a;
  float behind_alpha = u_background.a;
  if (ray.y < 0.0) {
    float floor_travel = (FLOOR - eye.y) / ray.y;
    vec3 spot = eye + ray * floor_travel;
    float fade = exp(-floor_travel * 0.06);
    vec3 floor_light = glow_color * exp(-dot(spot.xz, spot.xz) * 0.45) * (0.08 + 0.3 * u_glow);
    if (u_quality > 0) {
      vec3 bounce = vec3(ray.x, -ray.y, ray.z);
      ChromeHit mirror = chrome_march(spot, bounce, u_quality == 1 ? 16 : 40, pixel * 3.0);
      if (mirror.hit) {
        vec3 seen = spot + bounce * mirror.at;
        vec3 n = chrome_normal(seen, 0.004);
        floor_light += chrome_environment(reflect(bounce, n)) * u_metalColor.rgb * 0.3;
      } else {
        floor_light += glow_color * exp(-max(mirror.closest, 0.0) * 9.0) * 0.12 * u_glow;
      }
    }
    floor_light *= fade;
    behind += floor_light;
    behind_alpha = max(behind_alpha, clamp(max(floor_light.r, max(floor_light.g, floor_light.b)), 0.0, 1.0));
  }
  behind += glow_color * halo;
  behind_alpha = max(behind_alpha, clamp(halo, 0.0, 1.0));

  vec3 light = metal * cover + behind * (1.0 - cover) + vec3(u_flash * 0.06);
  float alpha = cover + (1.0 - cover) * behind_alpha;
  light = 1.0 - exp(-light * 1.4);
  return vec4(light / max(alpha, 0.0001), alpha);
}
`;
