import { defineShaderVisual } from "@difracta/render/sdk";

export const frameMarquee = defineShaderVisual({
  id: "frame-marquee",
  name: "Frame Marquee",
  description:
    "Alternating illuminated dashes chase around a Path, like the bulbs of a theatre sign.",
  notes:
    "A theatre-marquee outline: bind the Path around the Surface's edge and the dashes chase it by themselves. The band is Thickness pixels wide, centred on the Path, and is cut into Dashes cells that alternate between Color A and Color B, so half of them are each colour; raising Dashes on a long Path keeps the cells from stretching. Speed is in laps per second times a constant, runs both ways, and integrates, so reversing it live carries the phase on instead of jumping. The dash pattern is periodic in whole cells, so a closed Path has no seam where its last point meets its first whatever Dashes is set to. On an open Path the dashes simply run off the last point and new ones appear at the first, and the band gets a round cap at each end. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame and a little more with a sixteen-point Path. It is a hard-edged Visual with no glow: stack it over Frame Neon or Frame Electric for a lit outline with a chase on top, or put a Filter with bloom above it.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 0.769, 0.212, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0.157, 0.804, 1, 1],
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 14,
      min: 2,
      max: 80,
      step: 1,
      unit: "px",
    },
    dashes: {
      kind: "number",
      label: "Dashes",
      default: 24,
      min: 2,
      max: 96,
      step: 2,
      description: "Cells around the whole Path; half take each colour.",
    },
    speed: {
      kind: "number",
      label: "Chase Speed",
      default: 0.55,
      min: -4,
      max: 4,
      step: 0.05,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  fragment: `
uniform float u_time;

float marquee_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the band is as thick on a tall Surface as a wide one.
void marquee_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = marquee_segment_distance(point, start, end, along);
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
  marquee_path_metrics(uv, distanceToPath, pathPosition);

  float bandRadius = max(u_thickness, 0.0001) * 0.5;
  float edge = max(fwidth(distanceToPath) * 1.5, 0.5);
  float coverage = 1.0 - smoothstep(bandRadius, bandRadius + edge, distanceToPath);

  // Whole cells keep the pattern seamless where a closed Path meets itself.
  float cells = max(2.0, floor(u_dashes + 0.5));
  float travel = fract(pathPosition - u_time);
  float alternate = mod(floor(travel * cells), 2.0);
  vec4 color = mix(u_colorA, u_colorB, alternate);
  return vec4(color.rgb, coverage * color.a);
}`,
  create() {
    let time = 0;
    return {
      update({ dt, params, changed }) {
        // A lap of the Path per 12.5 seconds at Speed one; wrapped, so the
        // phase never grows and reversing carries it on.
        time = (((time + dt * params.speed * 0.08) % 1) + 1) % 1;
        return {
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          changed: changed || params.speed !== 0,
          uniforms: { time },
        };
      },
    };
  },
});
