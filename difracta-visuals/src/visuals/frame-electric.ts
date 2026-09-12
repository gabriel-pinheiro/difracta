import { defineShaderVisual } from "@difracta/render/sdk";

export const frameElectric = defineShaderVisual({
  id: "frame-electric",
  name: "Frame Electric",
  description:
    "A corona of flickering electric filaments crawls along a Path, brightest at the line and fading with distance.",
  notes:
    "A continuous outline effect: bind the Path around the Surface's edge, or along any line to electrify, and it hums by itself. The core is a thin bright line on the Path in Core Color; the filaments are ridged noise in Glow Color, laid out along the Path and fading out over Reach pixels on both sides. Filament Density is how many filaments fit around the whole Path, so a longer Path needs a higher value for the same look. Speed integrates, so changing it live never jumps. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame, more with a sixteen-point Path; keep it on one Layer per Surface on a weak Output. Additive blend mode over a dark Scene makes the corona bloom.",
  parameters: {
    coreColor: {
      kind: "color",
      label: "Core Color",
      default: [0.94, 0.97, 1, 1],
    },
    glowColor: {
      kind: "color",
      label: "Glow Color",
      default: [0.35, 0.55, 1, 1],
    },
    reach: {
      kind: "number",
      label: "Reach",
      default: 46,
      min: 4,
      max: 160,
      step: 2,
      unit: "px",
    },
    density: {
      kind: "number",
      label: "Filament Density",
      default: 30,
      min: 5,
      max: 80,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  fragment: `
uniform float u_time;
uniform float u_seed;

float corona_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float corona_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = corona_hash(cell);
  float b = corona_hash(cell + vec2(1.0, 0.0));
  float c = corona_hash(cell + vec2(0.0, 1.0));
  float d = corona_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float corona_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 4; octave += 1) {
    value += amplitude * corona_noise(position);
    position = turn * position * 2.03 + 13.7;
    amplitude *= 0.5;
  }
  return value;
}

float corona_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the corona is as wide on a tall Surface as a wide one.
void corona_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
  vec2 point = uv * u_resolution;
  int segmentCount = u_path_frame_count - 1 + (u_path_frame_closed ? 1 : 0);
  float accumulatedLength = 0.0;
  float closestLength = 0.0;
  distanceToPath = 1.0e9;
  for (int index = 0; index < 16; index += 1) {
    if (index >= segmentCount) break;
    int nextIndex = (index + 1) % u_path_frame_count;
    vec2 start = u_path_frame_points[index] * u_resolution;
    vec2 end = u_path_frame_points[nextIndex] * u_resolution;
    float segmentLength = length(end - start);
    float along = 0.0;
    float candidate = corona_segment_distance(point, start, end, along);
    if (candidate < distanceToPath) {
      distanceToPath = candidate;
      closestLength = accumulatedLength + segmentLength * along;
    }
    accumulatedLength += segmentLength;
  }
  pathPosition = closestLength / max(accumulatedLength, 0.000001);
}

vec4 render_visual(vec2 uv) {
  float distanceToPath = 0.0;
  float pathPosition = 0.0;
  corona_path_metrics(uv, distanceToPath, pathPosition);
  float band = distanceToPath / max(u_reach, 0.0001);

  // Two layers of ridged noise in (path position, distance) space read as
  // electric filaments crawling around the frame.
  vec2 domainA = vec2(pathPosition * u_density, band * 2.6 - u_time * 0.7);
  float ridgeA = abs(corona_fbm(domainA + vec2(u_time * 1.9, 0.0)) - 0.5);
  vec2 domainB = vec2(pathPosition * u_density * 1.9 + 7.3, band * 3.4 + u_time * 0.5);
  float ridgeB = abs(corona_fbm(domainB - vec2(u_time * 1.3, 0.0)) - 0.5);
  float filaments = exp(-ridgeA * ridgeA * 240.0) + 0.7 * exp(-ridgeB * ridgeB * 300.0);

  float falloff = exp(-band * 2.4) * (1.0 - smoothstep(0.8, 1.0, band));
  float flickerNoise = corona_noise(vec2(u_time * 9.0, pathPosition * 14.0));
  float flicker = 0.65 + 0.35 * flickerNoise;
  float aura = filaments * falloff * flicker;

  float coreWidth = 2.5;
  float core = exp(-distanceToPath * distanceToPath / (coreWidth * coreWidth)) * (0.8 + 0.2 * flickerNoise);

  vec3 rgb = u_glowColor.rgb * aura * u_glowColor.a + u_coreColor.rgb * (core + aura * 0.45) * u_coreColor.a;
  float alpha = clamp(core * u_coreColor.a + aura * u_glowColor.a, 0.0, 1.0);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = 0;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
