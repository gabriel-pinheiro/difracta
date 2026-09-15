import { defineShaderVisual } from "@difracta/render/sdk";

export const orbitalArcs = defineShaderVisual({
  id: "orbital-arcs",
  name: "Orbital Arcs",
  description:
    "Concentric rings broken into single arcs orbit the centre, each ring at its own pace and neighbours in opposite directions.",
  notes:
    "A machine of a backdrop, like the dial of an instrument coming apart: Rings concentric circles fill the Surface, each cut down to one arc, and each ring turns faster than the one inside it with neighbouring rings running opposite ways, so the arcs slide past each other and line up only by accident. Arc Length is how much of each ring is lit, from short ticks at zero to nearly closed circles at full; Thickness is the stroke of the ring itself, in Surface units, and the two are independent, so short and fat or long and fine are both available. Trailing Edge softens the end the arc sweeps away from, which reads as motion blur when it is wide. Rings alternate in mix between Color A and Color B by index rather than by ring number, so the coloring looks scattered. Speed integrates, so it can be swept live and stopped without a jump, and stopped rings cost nothing. Cheap. Good under Rotor on additive blend mode, or alone on a circular Surface. Costs one full-Surface pass per frame while turning.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [0, 1, 0.376, 1] },
    colorB: { kind: "color", label: "Color B", default: [0, 0.502, 1, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    arcLength: {
      kind: "number",
      label: "Arc Length",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How much of each ring is lit.",
    },
    rings: {
      kind: "number",
      label: "Rings",
      default: 9,
      min: 2,
      max: 48,
      step: 1,
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 0.012,
      min: 0.002,
      max: 0.06,
      step: 0.002,
    },
    gap: {
      kind: "number",
      label: "Trailing Edge",
      default: 0.03,
      min: 0,
      max: 0.25,
      step: 0.005,
      description: "How far the arc fades out behind itself, in turns.",
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  float radius = length(p);
  float angle = atan(p.y, p.x + 0.00001);
  float ring = floor(radius * u_rings);
  float distance = abs(fract(radius * u_rings) - 0.5) / u_rings;
  float pace = (0.1 + ring * 0.018) * (mod(ring, 2.0) * 2.0 - 1.0);
  float arc = fract(angle / 6.2831853 + u_time * pace);
  float extent = 0.18 + u_arcLength * 0.66;
  float gate = 1.0 - smoothstep(extent, extent + max(u_gap, 0.001), arc);
  float stroke = 1.0 - smoothstep(u_thickness, u_thickness + max(fwidth(distance), 0.002), distance);
  vec4 color = mix(u_colorA, u_colorB, fract(ring * 0.31));
  return vec4(color.rgb, color.a * clamp(stroke * gate, 0.0, 1.0));
}`,
  create({ random }) {
    // Every ring turns at its own pace, so there is no shared period to wrap at.
    let time = random() * 60;
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { time },
        };
      },
    };
  },
});
