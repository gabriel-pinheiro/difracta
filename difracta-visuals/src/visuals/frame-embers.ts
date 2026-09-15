import { defineShaderVisual } from "@difracta/render/sdk";

export const frameEmbers = defineShaderVisual({
  id: "frame-embers",
  name: "Frame Embers",
  description:
    "A Path glows with a flowing band of hot ember cores while sparks drift up off it.",
  notes:
    "A smouldering edge: the Path burns as a band about Width pixels wide in Ember Color, its edge licked in and out by noise so it never looks like a stroke, with Core Color burning through where the band is thickest. Speed drives the licking and the flicker; at zero the fire holds its shape and the Layer costs nothing to recomposite. Ember Rate is how much of the area near the Path throws sparks, and Drift how fast those sparks rise, in screen-up regardless of which way the Path runs, so the two read together: a high rate with no drift is a bed of coals and a low rate with high drift is a chimney. Sparks only appear within about four times Width of the Path, so Width also sets how far the shower spreads. Intensity scales the whole thing and blanks the Layer at zero. Every clock integrates, so Speed and Drift can be ridden live without a jump. On an open Path the band gets a round cap at each end and the licking noise simply stops there. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame plus a four-octave noise for the band. Additive blend mode over a dark Scene is what makes it burn; stack it under Frame Neon for a lit tube over a hot edge.",
  parameters: {
    ember: {
      kind: "color",
      label: "Ember Color",
      default: [1, 0.431, 0.118, 1],
    },
    core: {
      kind: "color",
      label: "Core Color",
      default: [1, 0.91, 0.627, 1],
    },
    width: {
      kind: "number",
      label: "Width",
      default: 12,
      min: 2,
      max: 80,
      step: 1,
      unit: "px",
    },
    emberRate: {
      kind: "number",
      label: "Ember Rate",
      default: 0.07,
      min: 0,
      max: 0.5,
      step: 0.01,
      percent: true,
      description: "How much of the area beside the Path throws sparks.",
    },
    drift: {
      kind: "number",
      label: "Drift",
      default: 2.2,
      min: 0,
      max: 8,
      step: 0.1,
      unit: "x",
      description: "How fast the sparks rise, upward on the Surface.",
    },
    intensity: {
      kind: "number",
      label: "Intensity",
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
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
uniform float u_rise;
uniform float u_seed;

float ember_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float ember_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = ember_hash(cell);
  float b = ember_hash(cell + vec2(1.0, 0.0));
  float c = ember_hash(cell + vec2(0.0, 1.0));
  float d = ember_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float ember_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 4; octave += 1) {
    value += amplitude * ember_noise(position);
    position = turn * position * 2.03 + 17.41;
    amplitude *= 0.5;
  }
  return value;
}

float ember_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the band is as wide on a tall Surface as a wide one.
void ember_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = ember_segment_distance(point, start, end, along);
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
  ember_path_metrics(uv, distanceToPath, pathPosition);
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  float width = max(u_width, 0.0001);

  // Glowing band around the Path, its width licked by noise like flames.
  float lick = ember_fbm(vec2(pathPosition * 26.0, u_time * 1.6));
  float licked = width * (0.45 + 1.1 * lick);
  float band = 1.0 - smoothstep(0.0, max(licked, 0.0001), distanceToPath);
  float flicker = 0.82 + 0.18 * sin(u_time * 7.0 + pathPosition * 90.0 + lick * 6.0);
  vec3 rgb = (u_ember.rgb * band + u_core.rgb * pow(band, 3.0)) * flicker;

  // Sparks drifting upward near the Path, in cells that scroll by one step.
  vec2 sparkSpace = uv * vec2(aspect, 1.0) * 42.0;
  sparkSpace.y += u_rise;
  vec2 cell = floor(sparkSpace);
  float sparkHash = ember_hash(cell);
  vec2 local = fract(sparkSpace) - 0.5;
  local += vec2(
    sin(u_time * 3.0 + sparkHash * 40.0),
    cos(u_time * 2.0 + sparkHash * 30.0)
  ) * 0.18;
  float sparkGlow = exp(-dot(local, local) * 34.0);
  float sparkGate = step(1.0 - u_emberRate, sparkHash);
  float sparkFlicker = 0.5 + 0.5 * sin(u_time * 11.0 + sparkHash * 90.0);
  float sparkBand = 1.0 - smoothstep(width, width * 4.0, distanceToPath);
  float sparks = sparkGlow * sparkGate * sparkFlicker * sparkBand;
  rgb += u_core.rgb * sparks;

  rgb *= u_intensity;
  float alpha = clamp((band * u_ember.a + sparks * u_core.a) * u_intensity, 0.0, 1.0);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = 0;
    let rise = 0;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        // One cell of the spark grid, so the pattern repeats and never grows.
        rise = (rise + dt * params.drift) % 1;
        const burning = params.speed > 0 || params.drift > 0;
        return {
          blank:
            params.intensity <= 0 ||
            (params.ember[3] <= 0 && params.core[3] <= 0),
          changed: changed || burning,
          uniforms: { time, rise, seed },
        };
      },
    };
  },
});
