import { defineShaderVisual } from "@difracta/render/sdk";

/** The two bends come back together after this; the clock wraps there. */
const CYCLE = Math.PI * 20;

export const ribbonCurrent = defineShaderVisual({
  id: "ribbon-current",
  name: "Ribbon Current",
  description:
    "Parallel ribbons of light run across the Surface, bending together through slow travelling waves.",
  notes:
    "A calm, liquid backdrop that fills a wide Surface end to end: Ribbons horizontal lines run the full width and the whole bundle is bent by two waves travelling along it, so the ribbons stay parallel while the bundle swims. Bend is how deep those waves cut; near zero the ribbons are almost straight rulings and the Visual reads as a grille, past half they fold back on themselves and crowd into bright seams where the bundle turns. Thickness is the stroke, in Surface units, and gets tight quickly as Ribbons goes up, so raise one and lower the other together. Color A and Color B are mixed along the bundle rather than assigned one each, so the ribbons shade from one to the other and back across the Surface. Speed integrates, so it can be swept live and stopped without a jump, and a stopped bundle costs nothing. Cheap. The natural bed to put Blade Cross or Light Sweep over on additive blend mode. Costs one full-Surface pass per frame while flowing.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0.753, 0, 1] },
    colorB: { kind: "color", label: "Color B", default: [1, 0.188, 0, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 4,
      step: 0.05,
    },
    bend: {
      kind: "number",
      label: "Bend",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How deep the travelling waves fold the bundle.",
    },
    ribbons: {
      kind: "number",
      label: "Ribbons",
      default: 8,
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
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  float fold = sin(p.x * 2.4 + u_time) * (0.12 + u_bend * 0.45);
  fold += sin(p.x * 5.0 - u_time * 0.7) * u_bend * 0.12;
  float lane = (p.y + fold) * u_ribbons * 0.5;
  float distance = abs(fract(lane) - 0.5) / (u_ribbons * 0.5);
  float stroke = 1.0 - smoothstep(u_thickness, u_thickness + max(fwidth(distance), 0.002), distance);
  vec4 color = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(lane * 0.7 + p.x));
  return vec4(color.rgb, color.a * clamp(stroke, 0.0, 1.0));
}`,
  create({ random }) {
    let time = random() * CYCLE;
    return {
      update({ dt, params, changed }) {
        time = (time + dt * params.speed) % CYCLE;
        return {
          changed: changed || params.speed > 0,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { time },
        };
      },
    };
  },
});
