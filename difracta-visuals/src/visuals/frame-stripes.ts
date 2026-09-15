import { defineShaderVisual } from "@difracta/render/sdk";

export const frameStripes = defineShaderVisual({
  id: "frame-stripes",
  name: "Frame Stripes",
  description:
    "Alternating colour stripes rotate around the band of a Path, like a barber's pole bent to shape.",
  notes:
    "A barber-pole band: bind the Path around the Surface's edge and Stripes slanted bars travel along it. The band is Thickness pixels wide, centred on the Path, and Stripes says how many bars fit around the whole Path, so a longer Path wants a higher value for the same width of bar. The slant comes from the stripe phase also shifting across the band, so a thicker band leans the bars further over; Thickness and Stripes therefore read together. Speed is in bars per second, runs both ways, and integrates, so reversing it live carries the phase on. Whole stripes keep the pattern seamless where a closed Path meets itself. On an open Path the bars run off the last point and the band gets a round cap at each end. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame, a little more with a sixteen-point Path. It is flat and opaque: use it as the lit body of a frame under Frame Marquee's chase, or over a Solid Color Layer, and give it a bloom Filter if you want it to glow.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 0.196, 0.431, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0.925, 1, 0.878, 1],
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 24,
      min: 3,
      max: 120,
      step: 1,
      unit: "px",
    },
    stripes: {
      kind: "number",
      label: "Stripes",
      default: 18,
      min: 2,
      max: 80,
      step: 2,
      description: "Bars around the whole Path; half take each colour.",
    },
    speed: {
      kind: "number",
      label: "Rotation Speed",
      default: 0.4,
      min: -4,
      max: 4,
      step: 0.05,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  fragment: `
uniform float u_time;

float stripes_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the band is as thick on a tall Surface as a wide one.
void stripes_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = stripes_segment_distance(point, start, end, along);
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
  stripes_path_metrics(uv, distanceToPath, pathPosition);

  float bandRadius = max(u_thickness, 0.0001) * 0.5;
  float edge = max(fwidth(distanceToPath) * 1.5, 0.5);
  float coverage = 1.0 - smoothstep(bandRadius, bandRadius + edge, distanceToPath);

  // Whole stripes keep the pattern seamless where a closed Path meets itself;
  // the shift across the band is what leans the bars over.
  float bars = max(2.0, floor(u_stripes + 0.5));
  float across = distanceToPath / bandRadius;
  float stripePosition = pathPosition * bars + across * 1.25 - u_time;
  float alternate = step(0.5, fract(stripePosition));
  vec4 color = mix(u_colorA, u_colorB, alternate);
  return vec4(color.rgb, coverage * color.a);
}`,
  create() {
    let time = 0;
    return {
      update({ dt, params, changed }) {
        // Bars per second at Speed one; wrapped, so the phase never grows.
        time = (((time + dt * params.speed * 1.8) % 1) + 1) % 1;
        return {
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          changed: changed || params.speed !== 0,
          uniforms: { time },
        };
      },
    };
  },
});
