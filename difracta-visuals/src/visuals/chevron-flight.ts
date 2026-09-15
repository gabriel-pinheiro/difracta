import { defineShaderVisual } from "@difracta/render/sdk";

export const chevronFlight = defineShaderVisual({
  id: "chevron-flight",
  name: "Chevron Flight",
  description:
    "Columns of luminous chevrons fly up and down the Surface, neighbouring columns going opposite ways in two colors.",
  recommended: true,
  notes:
    "A strong directional pattern for electronic music: each column is a stack of V-shaped stripes travelling vertically, even columns one way in Color A, odd columns the other way in Color B. Columns sets how many stripes-wide the Surface is and Rows how many chevrons fit top to bottom, so 6 by 5 reads as bold arrows and 24 by 10 as a herringbone texture. Chevron Depth bends the stripes from nearly flat bars into sharp arrowheads and thickens them a little. Width is the base stripe thickness. Speed integrates, so it can be swept live and stopped without a jump, and a stopped pattern costs nothing. Additive blend mode makes two Layers of it interfere brightly. Costs one full-Surface pass per frame while moving.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [0.5, 1, 0, 1] },
    colorB: { kind: "color", label: "Color B", default: [0, 1, 0.376, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    depth: {
      kind: "number",
      label: "Chevron Depth",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    columns: {
      kind: "number",
      label: "Columns",
      default: 6,
      min: 2,
      max: 48,
      step: 1,
    },
    rows: {
      kind: "number",
      label: "Rows",
      default: 5,
      min: 1,
      max: 12,
      step: 1,
      description: "Chevrons per column, top to bottom.",
    },
    width: {
      kind: "number",
      label: "Width",
      default: 0.012,
      min: 0.002,
      max: 0.06,
      step: 0.002,
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  float column = floor(uv.x * u_columns);
  float local_x = abs(fract(uv.x * u_columns) - 0.5);
  float direction = mod(column, 2.0) * 2.0 - 1.0;
  float chevron = uv.y * u_rows + local_x * (0.5 + u_depth) - u_time * direction;
  float distance = abs(fract(chevron) - 0.5);
  // Differentiate the continuous coordinates, not the phase jumps between columns.
  float edge = max(fwidth(uv.x) * u_columns * (0.5 + u_depth) + fwidth(uv.y) * u_rows, 0.002);
  float line_width = u_width * (2.0 + u_depth * 5.0);
  float light = 1.0 - smoothstep(line_width, line_width + edge, distance);
  vec4 color = mix(u_colorA, u_colorB, mod(column, 2.0));
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
