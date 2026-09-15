import { defineShaderVisual } from "@difracta/render/sdk";

/** Beams the fragment can draw; the Beams Parameter stops at this. */
const MAX_BEAMS = 6;

export const sirenBeacon = defineShaderVisual({
  id: "siren-beacon",
  name: "Siren Beacon",
  description:
    "A rotating emergency beacon: broad soft beams in alternating colors sweep around a pivot and flare the whole Surface as each one points down.",
  notes:
    "An alarm for builds and drops, built to be held on a pad: the beams are already turning on the first frame, from a random angle each press. Beams cones of light turn around Horizontal and Vertical Position, alternating Color A and Color B (an odd count puts two of Color A side by side), each Beam Width degrees wide with a soft edge, dimming with distance from the pivot. Every time a beam points straight down, toward the room, it flares: Flare washes the whole Surface in that beam's color for as long as the beam faces down, so narrow beams give short sharp flashes and wide ones long swells. Rotation Speed is turns per second, negative for the other way, and integrates, so a fader can ride it through zero; at zero the beacon holds still and costs nothing. Costs one full-Surface pass per frame with one cone per beam. Normal blend mode over a dark Scene is a warning light; Additive tints whatever is below. Pair it with Strobe in white on the same pad for a siren drop.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 0.04, 0.04, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0.08, 0.3, 1, 1],
    },
    beams: {
      kind: "number",
      label: "Beams",
      default: 2,
      min: 1,
      max: MAX_BEAMS,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Rotation Speed",
      default: 1,
      min: -4,
      max: 4,
      step: 0.05,
      unit: "Hz",
    },
    beamWidth: {
      kind: "number",
      label: "Beam Width",
      default: 50,
      min: 5,
      max: 160,
      step: 1,
      unit: "°",
    },
    flare: {
      kind: "number",
      label: "Flare",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How brightly the Surface flashes as a beam points down.",
    },
    x: {
      kind: "number",
      label: "Horizontal Position",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    y: {
      kind: "number",
      label: "Vertical Position",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
  },
  fragment: `
uniform float u_rotation;

const float TAU = 6.2831853;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - vec2(u_x, u_y)) * u_resolution;
  float shorter = min(u_resolution.x, u_resolution.y);
  float radius = length(p);
  // Zero is up and angles grow clockwise, as the Surface's y grows down.
  float angle = atan(p.x, -p.y);
  float half_width = radians(u_beamWidth) * 0.5;
  // The flare lasts while the beam's cone still covers straight down.
  float sharpness = 0.6931 / max(0.0005, -log(cos(min(half_width, 1.4))));
  float distance_fade = 1.0 / (1.0 + radius / (shorter * 0.8));
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int index = 0; index < ${String(MAX_BEAMS)}; index += 1) {
    float beam = float(index);
    if (beam >= u_beams) break;
    float heading = (u_rotation + beam / u_beams) * TAU;
    float offset = abs(mod(angle - heading + TAU * 0.5, TAU) - TAU * 0.5);
    float cone = exp(-pow(offset / half_width, 2.0) * 1.6);
    float facing = pow(max(0.0, -cos(heading)), sharpness);
    float light = cone * distance_fade * (0.8 + 0.6 * facing) + facing * u_flare * 0.6;
    vec4 color = mix(u_colorA, u_colorB, mod(beam, 2.0));
    rgb += color.rgb * color.a * light;
    alpha += color.a * light;
  }
  alpha = min(alpha, 1.0);
  return vec4(min(rgb, vec3(1.0)) / max(alpha, 0.0001), alpha);
}`,
  create({ random }) {
    let rotation = random();
    return {
      update({ dt, params, changed }) {
        rotation = (rotation + dt * params.speed) % 1;
        return {
          changed: changed || params.speed !== 0,
          uniforms: { rotation },
        };
      },
    };
  },
});
