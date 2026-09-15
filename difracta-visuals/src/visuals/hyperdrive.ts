import { defineShaderVisual } from "@difracta/render/sdk";

/**
 * Every lane's rate is a multiple of 1/16 of the travel, so the whole
 * field repeats after this much travel and the clock can wrap there.
 */
const PERIOD = 16;
/** The most Acceleration can multiply Speed by, however long it is held. */
const MAX_BOOST = 4;

export const hyperdrive = defineShaderVisual({
  id: "hyperdrive",
  name: "Hyperdrive",
  description:
    "Warp-speed star streaks rush outward from a centre, stretching longer the faster they go, and can keep accelerating while held.",
  notes:
    "Built to be held on a pad for a build or a drop: the field is full from the first frame, and with Acceleration above zero Speed keeps multiplying the longer the Layer stays enabled, up to four times, so holding it through a riser reads as punching into light speed and every new press starts again from Speed. Streaks leave from Horizontal and Vertical Position in Density lanes on three depths, far ones slower and dimmer, and speed up as they near the edge; Streak Length is scaled by the current speed, so a slow drift shows points and a fast one long lines. Width is the streak thickness in pixels at the edge, thinner toward the centre. Core Glow is a soft light at the centre in Color B. Speed integrates, so a fader can ride it without a jump, and Speed at zero freezes the field and costs nothing. Costs one full-Surface pass per frame with three lane lookups per pixel. Additive blend mode over a Scene makes it a light on top; stack Strobe or Flash Matrix over it for the drop itself.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 1, 1, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0.3, 0.75, 1, 1],
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1.5,
      min: 0,
      max: 6,
      step: 0.05,
    },
    acceleration: {
      kind: "number",
      label: "Acceleration",
      default: 0.3,
      min: 0,
      max: 2,
      step: 0.05,
      unit: "x/s",
      description:
        "How much Speed grows per second held, up to four times Speed.",
    },
    density: {
      kind: "number",
      label: "Density",
      default: 90,
      min: 16,
      max: 240,
      step: 1,
      description: "Lanes around the centre on the nearest depth.",
    },
    length: {
      kind: "number",
      label: "Streak Length",
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    width: {
      kind: "number",
      label: "Width",
      default: 2.5,
      min: 0.5,
      max: 10,
      step: 0.5,
      unit: "px",
    },
    glow: {
      kind: "number",
      label: "Core Glow",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
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
uniform float u_travel;
uniform float u_stretch;

// Integer mixing keeps lane luck exact however many passes have gone by.
float lane_random(float lane, float layer, float pass, uint channel) {
  uint value = uint(int(lane)) * 747796405u ^ uint(int(layer)) * 2891336453u
    ^ uint(int(pass)) * 1181783497u ^ channel * 277803737u;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  return float(value >> 8u) / 16777216.0;
}

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - vec2(u_x, u_y)) * u_resolution;
  float radius = length(p);
  float reach = length(u_resolution);
  float around = atan(p.y, p.x) / 6.2831853 + 0.5;
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int index = 0; index < 3; index += 1) {
    float layer = float(index);
    float lanes = floor(u_density * (1.0 + layer * 0.6));
    float lane_coordinate = around * lanes;
    float lane = mod(floor(lane_coordinate), lanes);
    float offset = lane_random(lane, layer, 0.0, 0u);
    float rate = (0.5 + floor(lane_random(lane, layer, 0.0, 1u) * 4.0) * 0.25) * (1.0 - layer * 0.25);
    float progress = offset + u_travel * rate;
    float pass = floor(progress);
    if (lane_random(lane, layer, pass, 2u) > 0.8) continue;
    float depth = progress - pass;
    float head = pow(depth, 2.2) * reach;
    float tail = max(0.0, head - max(1.5, u_length * u_stretch * reach * pow(depth, 1.2) * 0.6));
    if (radius > head + 2.0 || radius < tail) continue;
    float centre = 0.2 + 0.6 * lane_random(lane, layer, pass, 3u);
    float across = abs(fract(lane_coordinate) - centre) * 6.2831853 * radius / lanes;
    float half_width = u_width * (0.2 + depth * 0.8) * 0.5;
    float core = 1.0 - smoothstep(half_width, half_width + 1.0, across);
    float along = smoothstep(tail, head, radius) * (1.0 - smoothstep(head, head + 2.0, radius));
    float light = core * along * smoothstep(0.0, 0.2, depth) * (1.0 - layer * 0.25);
    vec4 color = mix(u_colorA, u_colorB, lane_random(lane, layer, pass, 4u));
    rgb += color.rgb * color.a * light;
    alpha += color.a * light;
  }
  float core_glow = u_glow * exp(-radius / (reach * 0.07));
  rgb += u_colorB.rgb * u_colorB.a * core_glow;
  alpha += u_colorB.a * core_glow;
  alpha = min(alpha, 1.0);
  return vec4(min(rgb, vec3(1.0)) / max(alpha, 0.0001), alpha);
}`,
  create({ random }) {
    let travel = random() * PERIOD;
    let held = 0;
    return {
      update({ dt, params, changed }) {
        held += dt;
        const boost = Math.min(MAX_BOOST, 1 + params.acceleration * held);
        const velocity = params.speed * boost;
        travel = (travel + dt * velocity * 0.5) % PERIOD;
        const stretch = Math.min(3, 0.1 + velocity * 0.45);
        return {
          changed: changed || velocity > 0,
          uniforms: { travel, stretch },
        };
      },
    };
  },
});
