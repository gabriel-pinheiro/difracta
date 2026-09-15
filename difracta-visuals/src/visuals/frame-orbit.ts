import { defineShaderVisual } from "@difracta/render/sdk";

export const frameOrbit = defineShaderVisual({
  id: "frame-orbit",
  name: "Frame Orbit",
  description:
    "Bright accents travel around a thin, softly lit Path, like lamps running a rail.",
  notes:
    "A quiet outline with something running it: the Path is drawn as a hairline in Frame Color, Width pixels of band around it, and Lights accents in Orbit Color slide along it evenly spaced. Light Size is the length of one accent as a share of the whole Path, so one light at ten percent covers a tenth of the frame however long the frame is; raise Lights and lower Light Size together or they merge into a continuous glow. Width sets both the hairline, about a fifth of it, and how far off the Path an accent still shows, so a wider Width makes fatter lamps as well as a fatter line. Orbit Speed is in laps per second times a constant, runs both ways, and integrates, so reversing it live carries the phase on. Whole lights keep the spacing seamless where a closed Path meets itself. On an open Path a light runs off the last point and the next one appears at the first, and the hairline gets a round cap at each end. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame. It is dim by design: additive blend mode over a dark Scene, or under Frame Neon, is where it reads best.",
  parameters: {
    frame: {
      kind: "color",
      label: "Frame Color",
      default: [0.2, 0.839, 1, 1],
    },
    orbit: {
      kind: "color",
      label: "Orbit Color",
      default: [1, 0.937, 0.545, 1],
    },
    width: {
      kind: "number",
      label: "Width",
      default: 10,
      min: 2,
      max: 64,
      step: 1,
      unit: "px",
    },
    count: {
      kind: "number",
      label: "Lights",
      default: 1,
      min: 1,
      max: 24,
      step: 1,
    },
    size: {
      kind: "number",
      label: "Light Size",
      default: 0.05,
      min: 0.005,
      max: 0.5,
      step: 0.005,
      percent: true,
      description: "How much of the Path's length one accent covers.",
    },
    speed: {
      kind: "number",
      label: "Orbit Speed",
      default: 0.6,
      min: -4,
      max: 4,
      step: 0.05,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  fragment: `
uniform float u_time;

float orbit_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the line is as thin on a tall Surface as a wide one.
void orbit_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = orbit_segment_distance(point, start, end, along);
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
  orbit_path_metrics(uv, distanceToPath, pathPosition);

  float edge = max(fwidth(distanceToPath) * 1.5, 0.5);
  float hairline = max(u_width * 0.22, 0.5);
  float line = 1.0 - smoothstep(hairline, hairline + edge, distanceToPath);

  // Whole lights keep the spacing seamless where a closed Path meets itself.
  float lights = max(1.0, floor(u_count + 0.5));
  float cell = fract(pathPosition * lights - u_time);
  float alongLight = min(cell, 1.0 - cell) / lights;
  float falloff = alongLight / max(u_size * 0.5, 0.000001);
  float orbit = exp(-falloff * falloff) *
    (1.0 - smoothstep(u_width, u_width + edge, distanceToPath));

  vec3 rgb = u_frame.rgb * line * u_frame.a + u_orbit.rgb * orbit * u_orbit.a;
  float alpha = max(line * u_frame.a, orbit * u_orbit.a);
  return vec4(rgb, alpha);
}`,
  create() {
    let time = 0;
    return {
      update({ dt, params, changed }) {
        // A lap of the Path per 11 seconds at Speed one; wrapped, so the
        // phase never grows and reversing carries it on.
        time = (((time + dt * params.speed * 0.09) % 1) + 1) % 1;
        return {
          blank: params.frame[3] <= 0 && params.orbit[3] <= 0,
          changed: changed || params.speed !== 0,
          uniforms: { time },
        };
      },
    };
  },
});
