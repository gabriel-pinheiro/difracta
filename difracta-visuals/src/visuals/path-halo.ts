import { defineShaderVisual } from "@difracta/render/sdk";

export const pathHalo = defineShaderVisual({
  id: "path-halo",
  name: "Path Halo",
  description:
    "A luminous halo traces a Path while colour pulses travel along it.",
  notes:
    "The softest way to state a Path: a lit line Halo Width pixels across in Halo Color, wrapped in a halo that falls off exponentially over Glow Reach pixels, with Pulses bands of Pulse Color travelling along it. Halo Width and Glow Reach are independent, so a thin line inside a wide bloom or a fat line with almost no bloom are both one edit away; Pulses is how many pulses fit around the whole Path, so a longer Path wants more of them for the same spacing. Pulse Speed is in pulses per second times a constant and integrates, so changing it live never jumps; at zero the colours freeze mid-pulse and the Layer costs nothing to recomposite. Whole pulses keep the wave seamless where a closed Path meets itself. On an open Path the line gets a round cap at each end and the pulses run off the last point rather than wrapping. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame, a little more with a sixteen-point Path. Additive blend mode over a dark Scene is what makes the bloom read; it is the calm one to leave running under Lightning Strikes or Frame Marquee.",
  parameters: {
    halo: {
      kind: "color",
      label: "Halo Color",
      default: [0.275, 0.898, 1, 1],
    },
    pulse: {
      kind: "color",
      label: "Pulse Color",
      default: [1, 0.329, 0.722, 1],
    },
    width: {
      kind: "number",
      label: "Halo Width",
      default: 18,
      min: 3,
      max: 80,
      step: 1,
      unit: "px",
    },
    reach: {
      kind: "number",
      label: "Glow Reach",
      default: 18,
      min: 4,
      max: 160,
      step: 1,
      unit: "px",
      description: "How far the bloom fades out from the line.",
    },
    pulses: {
      kind: "number",
      label: "Pulses",
      default: 8,
      min: 1,
      max: 48,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Pulse Speed",
      default: 0.45,
      min: 0,
      max: 3,
      step: 0.01,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Path" }],
  fragment: `
uniform float u_time;

float halo_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the halo is as wide on a tall Surface as a wide one.
void halo_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = halo_segment_distance(point, start, end, along);
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
  halo_path_metrics(uv, distanceToPath, pathPosition);

  float edge = max(fwidth(distanceToPath) * 1.5, 0.5);
  float lineRadius = max(u_width * 0.1, 0.5);
  float line = 1.0 - smoothstep(lineRadius, lineRadius + edge, distanceToPath);
  float halo = exp(-distanceToPath / max(u_reach, 0.0001));

  // Whole pulses keep the wave seamless where a closed Path meets itself.
  float bands = max(1.0, floor(u_pulses + 0.5));
  float wave = 0.5 + 0.5 * sin((pathPosition * bands - u_time) * 6.28318);
  vec4 color = mix(u_halo, u_pulse, wave);
  float alpha = clamp(halo * 0.7 + line, 0.0, 1.0) * color.a;
  return vec4(color.rgb * (0.45 + wave * 0.85), alpha);
}`,
  create() {
    let time = 0;
    return {
      update({ dt, params, changed }) {
        // Pulses per second at Speed one; wrapped, so the phase never grows.
        time = (time + dt * params.speed * 0.6366) % 1;
        return {
          blank: params.halo[3] <= 0 && params.pulse[3] <= 0,
          changed: changed || params.speed > 0,
          uniforms: { time },
        };
      },
    };
  },
});
