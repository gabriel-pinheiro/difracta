import { defineShaderVisual } from "@difracta/render/sdk";

export const conveyor = defineShaderVisual({
  id: "conveyor",
  name: "Conveyor",
  description:
    "Horizontal lanes carry solid packets of light across the Surface, neighbouring lanes running opposite ways in two colors.",
  notes:
    "A mechanical, rhythmic backdrop: every lane is a belt, even lanes run one way in Color A and odd lanes the other way in Color B. Lanes is how many belts stack down the Surface and Packets how many packets each belt carries across it, so Lanes 8 with Packets 5 is coarse and legible from far away while 24 and 10 is a fine texture. Packet Fill is the lit share of each packet's slot, from thin dashes to almost solid belts. Edge Softness feathers the gap between belts. Speed integrates, so it can be swept live and stopped without a jump, and a stopped Conveyor costs nothing. Additive blend mode makes crossings between Layers glow. Costs one full-Surface pass per frame while moving.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0.125, 0, 1] },
    colorB: { kind: "color", label: "Color B", default: [1, 0.75, 0, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    fill: {
      kind: "number",
      label: "Packet Fill",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    lanes: {
      kind: "number",
      label: "Lanes",
      default: 8,
      min: 2,
      max: 48,
      step: 1,
    },
    packets: {
      kind: "number",
      label: "Packets",
      default: 5,
      min: 1,
      max: 12,
      step: 1,
      description: "Packets per lane across the Surface.",
    },
    softness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.05,
      min: 0,
      max: 0.25,
      step: 0.005,
      description: "The feather between lanes, as a share of a lane.",
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  float row = floor(uv.y * u_lanes);
  float direction = mod(row, 2.0) * 2.0 - 1.0;
  float x = fract(uv.x * u_packets - u_time * direction);
  float y = abs(fract(uv.y * u_lanes) - 0.5);
  float fill = 0.12 + u_fill * 0.65;
  float edge = max(fwidth(x), 0.002);
  float packet = 1.0 - smoothstep(fill, fill + edge, x);
  float lane = 1.0 - smoothstep(0.28, 0.28 + u_softness, y);
  vec4 color = mix(u_colorA, u_colorB, mod(row, 2.0));
  return vec4(color.rgb, color.a * clamp(packet * lane, 0.0, 1.0));
}`,
  create({ random }) {
    let time = random();
    return {
      update({ dt, params, changed }) {
        time = (time + dt * params.speed) % 1;
        return {
          changed: changed || params.speed > 0,
          uniforms: { time },
        };
      },
    };
  },
});
