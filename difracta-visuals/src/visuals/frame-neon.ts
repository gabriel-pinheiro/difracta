import { defineShaderVisual } from "@difracta/render/sdk";

export const frameNeon = defineShaderVisual({
  id: "frame-neon",
  name: "Frame Neon",
  description:
    "A Path becomes a pulsing neon tube with a bloom around it and the flicker of a tired sign.",
  notes:
    "A neon sign bent to the Path: a white-hot core Tube Width pixels across in Tube Color, wrapped in a halo that fades out over about four times that, stretched further by Glow Reach. Flicker is how tired the sign is, from a perfectly steady tube at zero to an electrical hum plus hard dropouts at one; Flicker Rate is how often it rolls for a dropout, so a low rate gives long, lazy blackouts and a high one a nervous stutter, and neither does anything while Flicker is zero. Pulse Speed sends a soft brightness wave twice round the tube; at zero and with Flicker at zero the sign is perfectly still and the Layer costs nothing to recomposite. Every clock integrates, so changing Pulse Speed or Flicker Rate live never jumps. On an open Path the tube gets a round cap at each end and the brightness wave runs off the last point rather than wrapping. The fragment walks every segment of the Path per pixel, so it costs one full-Surface pass per frame, a little more with a sixteen-point Path. Additive blend mode over a dark Scene is what makes the bloom read; stack Frame Marquee over it for a chase on a lit outline.",
  parameters: {
    tube: {
      kind: "color",
      label: "Tube Color",
      default: [1, 0.235, 0.706, 1],
    },
    width: {
      kind: "number",
      label: "Tube Width",
      default: 6,
      min: 1,
      max: 40,
      step: 0.5,
      unit: "px",
    },
    glow: {
      kind: "number",
      label: "Glow Reach",
      default: 1,
      min: 0.2,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    flicker: {
      kind: "number",
      label: "Flicker",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    flickerRate: {
      kind: "number",
      label: "Flicker Rate",
      default: 7,
      min: 0.5,
      max: 30,
      step: 0.5,
      unit: "/s",
      description: "How often the tube rolls for a dropout.",
    },
    speed: {
      kind: "number",
      label: "Pulse Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  fragment: `
uniform float u_hum;
uniform float u_chase;
uniform float u_gate;

float neon_segment_distance(vec2 point, vec2 start, vec2 end, out float along) {
  vec2 segment = end - start;
  float lengthSquared = max(dot(segment, segment), 0.000001);
  along = clamp(dot(point - start, segment) / lengthSquared, 0.0, 1.0);
  return length(point - (start + segment * along));
}

// Distance to the Path and the fraction of its length at the nearest place,
// measured in pixels so the tube is as thick on a tall Surface as a wide one.
void neon_path_metrics(vec2 uv, out float distanceToPath, out float pathPosition) {
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
    float candidate = neon_segment_distance(point, start, end, along);
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
  neon_path_metrics(uv, distanceToPath, pathPosition);
  float tubeWidth = max(u_width, 0.0001);

  // Electrical hum plus the occasional hard dropout, like a tired sign; both
  // are Flicker, so at zero the tube is perfectly steady.
  float hum = 1.0 - 0.08 * u_flicker *
    (0.5 - 0.5 * sin(u_hum * 47.0 + sin(u_hum * 13.0) * 3.0));
  float dropout = mix(1.0, step(0.12, u_gate), u_flicker);
  // A soft brightness pulse chases twice around the tube.
  float chase = 0.85 + 0.15 * sin((pathPosition - u_chase) * 6.28318 * 2.0);
  float energy = hum * dropout * chase;

  float core = 1.0 - smoothstep(0.0, tubeWidth, distanceToPath);
  float halo = exp(-distanceToPath / max(0.0001, tubeWidth * 4.0 * u_glow));

  vec3 rgb = u_tube.rgb * halo * 0.55 * energy;
  rgb = mix(rgb, vec3(1.0), core * 0.75 * energy);

  float alpha = clamp((core + halo * 0.55) * energy * u_tube.a, 0.0, 1.0);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let hum = 0;
    let chase = 0;
    let gate = random();
    // The hum runs at 47 and 13 times its clock, so a full turn returns it.
    const HUM_PERIOD = Math.PI * 2;
    let sinceRoll = 0;
    return {
      update({ dt, params, changed }) {
        const alive = params.flicker > 0;
        if (alive) {
          hum = (hum + dt) % HUM_PERIOD;
          sinceRoll += dt * params.flickerRate;
          while (sinceRoll >= 1) {
            sinceRoll -= 1;
            gate = random();
          }
        }
        // Two waves per lap, so the phase wraps at half a lap.
        chase = (chase + dt * params.speed * 0.22) % 0.5;
        return {
          blank: params.tube[3] <= 0,
          changed: changed || alive || params.speed > 0,
          uniforms: { hum, chase, gate },
        };
      },
    };
  },
});
