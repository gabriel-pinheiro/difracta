import { defineShaderVisual } from "@difracta/render/sdk";

export const tunnel = defineShaderVisual({
  id: "tunnel",
  name: "Tunnel",
  description:
    "A square tunnel seen down its axis: depth lines rush toward or away from the viewer while the whole thing slowly rolls.",
  notes:
    "A driving, hypnotic backdrop for a rectangular Surface: concentric square rings spaced so they travel at a steady perceived speed, coloured by depth between Color A and Color B, with a glow along the two axes and a dark centre. Speed is the travel; negative flies backwards, and it integrates, so sweeping it live through zero reverses smoothly. Rotation is the roll rate and integrates the same way. Depth Lines is how many rings fit in one depth unit and Line Width their thickness as a share of the spacing. On a wide Surface the tunnel keeps square rings and the outer ones leave through the sides. Costs one full-Surface pass per frame while Speed or Rotation is non-zero, nothing when both are.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [0.24, 0.86, 1, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [1, 0.24, 0.82, 1],
    },
    density: {
      kind: "number",
      label: "Depth Lines",
      default: 9,
      min: 3,
      max: 24,
      step: 1,
    },
    width: {
      kind: "number",
      label: "Line Width",
      default: 0.08,
      min: 0.01,
      max: 0.3,
      step: 0.01,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.8,
      min: -4,
      max: 4,
      step: 0.1,
    },
    rotation: {
      kind: "number",
      label: "Rotation",
      default: 0.15,
      min: -2,
      max: 2,
      step: 0.05,
      unit: "rad/s",
    },
  },
  fragment: `
uniform float u_travel;
uniform float u_angle;

vec4 render_visual(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  mat2 roll = mat2(cos(u_angle), -sin(u_angle), sin(u_angle), cos(u_angle));
  p = roll * p;
  float radius = max(abs(p.x), abs(p.y));
  float depth = -log(max(0.001, radius));
  float line_phase = fract(depth * u_density * 0.22 - u_travel);
  float line = 1.0 - smoothstep(u_width, u_width + 0.03, abs(line_phase - 0.5));
  float axis_glow = exp(-min(abs(p.x), abs(p.y)) * 22.0) * 0.35;
  vec4 color = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(depth * 3.0));
  float alpha = max(line, axis_glow) * (1.0 - smoothstep(1.0, 1.6, radius));
  return vec4(color.rgb, color.a * alpha);
}`,
  create() {
    let travel = 0;
    let angle = 0;
    return {
      update({ dt, params, changed }) {
        travel = (travel + dt * params.speed) % 1;
        angle = (angle + dt * params.rotation) % (Math.PI * 2);
        return {
          changed: changed || params.speed !== 0 || params.rotation !== 0,
          uniforms: { travel, angle },
        };
      },
    };
  },
});
