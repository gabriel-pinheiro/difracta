import { defineShaderVisual } from "@difracta/render/sdk";

/** The spokes come back to where they started after a full turn. */
const TURN = Math.PI * 2;

export const rotor = defineShaderVisual({
  id: "rotor",
  name: "Rotor",
  description:
    "A wheel of evenly spaced spokes turns steadily around a dead centre, its color shifting along each spoke.",
  recommended: true,
  notes:
    "A steady engine of a backdrop: Spokes wedges radiate from the middle and the whole wheel turns at Speed. Spoke Width is the duty cycle, from fine lines with wide dark gaps at zero to wedges that almost close up the wheel at full, so it is the slider to ride against the music; Spokes restacks the picture and is better set once. Centre Hole is the radius left dark in the middle, as a share of the half-height, so the spokes appear out of a void instead of a pinch point; widen it and the Rotor reads as a turbine ring. Color A and Color B are mixed along and around the spokes rather than assigned one each, so two close hues read as one shaded metal and two far ones as a spinning rainbow. Speed integrates, so it can be swept live and stopped without a jump, and a stopped wheel costs nothing. Cheap at any setting. Put it under Blade Cross on additive blend mode, or behind Ribbon Current for depth. Costs one full-Surface pass per frame while turning.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0, 0, 1] },
    colorB: { kind: "color", label: "Color B", default: [1, 0.376, 0, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    width: {
      kind: "number",
      label: "Spoke Width",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How much of each spoke's slot is lit.",
    },
    spokes: {
      kind: "number",
      label: "Spokes",
      default: 12,
      min: 2,
      max: 48,
      step: 1,
    },
    hub: {
      kind: "number",
      label: "Centre Hole",
      default: 0.08,
      min: 0,
      max: 0.6,
      step: 0.01,
      description: "The radius left dark, as a share of the half-height.",
    },
  },
  fragment: `
uniform float u_angle;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  float radius = length(p);
  float angle = atan(p.y, p.x + 0.00001) - u_angle;
  float within = abs(fract(angle / 6.2831853 * u_spokes) - 0.5);
  float thickness = 0.004 + u_width * 0.27;
  float spoke = 1.0 - smoothstep(thickness, thickness + max(fwidth(within), 0.01), within);
  float light = spoke * smoothstep(u_hub, u_hub + 0.1, radius);
  vec4 color = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(angle * 2.0 + radius * 3.0));
  return vec4(color.rgb, color.a * clamp(light, 0.0, 1.0));
}`,
  create({ random }) {
    let angle = random() * TURN;
    return {
      update({ dt, params, changed }) {
        angle = (angle + dt * params.speed) % TURN;
        return {
          changed: changed || params.speed > 0,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { angle },
        };
      },
    };
  },
});
