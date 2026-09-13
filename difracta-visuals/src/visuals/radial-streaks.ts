import { defineShaderVisual } from "@difracta/render/sdk";

export const radialStreaks = defineShaderVisual({
  id: "radial-streaks",
  name: "Radial Streaks",
  description:
    "Segmented streaks of light race outward from a clear centre along evenly spaced spokes, each spoke on its own beat.",
  notes:
    "A rush toward the viewer, or a sunburst when slow: Streaks spokes leave the centre, and along each one a lit segment travels outward, offset per spoke so they never pulse together. Streak Length is how much of each spoke's cycle is lit, from short darts to long rays. Width is the spoke thickness, kept constant as it travels out. Center Hole is the radius left dark in the middle, as a share of the half-height, so the streaks appear from a void rather than a point. Colors alternate around the wheel between Color A and Color B. Speed integrates, so it can be swept live and stopped without a jump, and a stopped wheel costs nothing. Additive blend mode over a Scene lights it up. Costs one full-Surface pass per frame while moving.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [0.376, 0, 1, 1] },
    colorB: { kind: "color", label: "Color B", default: [1, 0, 0.25, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    length: {
      kind: "number",
      label: "Streak Length",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    streaks: {
      kind: "number",
      label: "Streaks",
      default: 24,
      min: 2,
      max: 48,
      step: 1,
    },
    width: {
      kind: "number",
      label: "Width",
      default: 0.012,
      min: 0.002,
      max: 0.06,
      step: 0.002,
    },
    hole: {
      kind: "number",
      label: "Center Hole",
      default: 0.08,
      min: 0,
      max: 0.6,
      step: 0.01,
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  float radius = length(p);
  float angle = atan(p.y, p.x + 0.00001);
  float lane = angle / 6.2831853 * u_streaks;
  float index = floor(lane);
  float distance = abs(fract(lane) - 0.5) * max(radius, 0.05) / u_streaks * 6.2831853;
  float packet = fract(radius * 2.0 - u_time - sin(index * 127.1) * 3.0);
  float extent = 0.15 + u_length * 0.7;
  float gate = 1.0 - smoothstep(extent, extent + 0.08, packet);
  float spoke = 1.0 - smoothstep(u_width, u_width + max(fwidth(distance), 0.002), distance);
  float light = spoke * gate * smoothstep(u_hole, u_hole + 0.17, radius);
  vec4 color = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(index * 2.4));
  return vec4(color.rgb, color.a * clamp(light, 0.0, 1.0));
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
