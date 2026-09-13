import { defineShaderVisual } from "@difracta/render/sdk";

export const contourDrift = defineShaderVisual({
  id: "contour-drift",
  name: "Contour Drift",
  description:
    "Glowing contour lines of a slowly morphing landscape drift across the Surface, colored by height between two colors.",
  notes:
    "A topographic map that breathes: the iso-lines of a smooth field, drifting diagonally while the field itself warps, so islands merge and ridges tighten. Contours is how many lines cross the height range; around 2 gives a few calm islands, 8 a dense map. Warp adds a second, moving fold to the field, from gentle at zero to knotted ridges at full. Width is the line thickness. Color A is low ground and Color B high, so two close hues read as one material and two far ones as a heat map. Speed integrates, so it can be swept live and stopped without a jump, and a stopped map costs nothing. Additive blend mode over a dark Scene makes the lines glow. Costs one full-Surface pass per frame while moving.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [0, 0.282, 1, 1] },
    colorB: { kind: "color", label: "Color B", default: [0.5, 0, 1, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    warp: {
      kind: "number",
      label: "Warp",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    contours: {
      kind: "number",
      label: "Contours",
      default: 2,
      min: 0.5,
      max: 10,
      step: 0.5,
    },
    width: {
      kind: "number",
      label: "Width",
      default: 0.035,
      min: 0.005,
      max: 0.2,
      step: 0.005,
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  vec2 q = p + vec2(u_time * 0.18, u_time * 0.09);
  float field = sin(q.x * 2.0) + cos(q.y * 2.6);
  field += sin(q.x * 3.4 + q.y * 2.2 + sin(u_time * 0.3)) * (0.15 + u_warp * 0.85);
  float distance = abs(fract(field * u_contours) - 0.5);
  float light = 1.0 - smoothstep(u_width, u_width + max(fwidth(distance), 0.002), distance);
  vec4 color = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(field * 1.4));
  return vec4(color.rgb, color.a * clamp(light, 0.0, 1.0));
}`,
  create({ random }) {
    // Not periodic in time, so the clock is not wrapped; a Layer starts somewhere of its own.
    let time = random() * 60;
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          uniforms: { time },
        };
      },
    };
  },
});
