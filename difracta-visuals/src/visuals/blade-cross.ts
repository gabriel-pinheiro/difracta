import { defineShaderVisual } from "@difracta/render/sdk";

/** The blades and their sway come back together after this; the clock wraps there. */
const CYCLE = Math.PI * 20;

/** The fragment's loop cap, and so the most blades a Layer can ask for. */
const MAX_BLADES = 16;

export const bladeCross = defineShaderVisual({
  id: "blade-cross",
  name: "Blade Cross",
  description:
    "Broad straight blades of light counter-rotate about the centre and cross each other, in two alternating colors.",
  notes:
    "A bold foreground for a drop: each blade is a full-width band at its own angle, and neighbouring blades turn opposite ways, so they scissor through each other and open again. Blades is how many there are, up to sixteen; two or three read as a searchlight cross, a dozen as a spinning star. Blade Width widens every blade at once, from hairlines that flicker as they cross to slabs that nearly fill the Surface, so it is the one to ride rather than Blades, which restacks the picture. Blades alternate between Color A and Color B and each one also slides sideways off centre as it turns, so the crossing point wanders. Speed integrates, so it can be swept live and stopped without a jump, and a stopped cross costs nothing. Heavy at full Blade Width with many Blades; stack it over Conveyor or Contour Drift on additive blend mode and drop it in for eight bars. Costs one full-Surface pass per frame while turning.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0.314, 0, 1] },
    colorB: { kind: "color", label: "Color B", default: [0, 0.188, 1, 1] },
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
      label: "Blade Width",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How thick every blade is, as a share of its widest.",
    },
    blades: {
      kind: "number",
      label: "Blades",
      default: 4,
      min: 2,
      max: MAX_BLADES,
      step: 1,
    },
  },
  fragment: `
uniform float u_time;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / max(1.0, u_resolution.y);
  float thickness = 0.002 + u_width * 0.095;

  float light = 0.0;
  float blend = 0.0;
  for (int index = 0; index < ${String(MAX_BLADES)}; index += 1) {
    float i = float(index);
    if (i >= u_blades) break;
    float angle = i * 3.14159265 / u_blades + u_time * (mod(i, 2.0) * 2.0 - 1.0);
    vec2 normal = vec2(cos(angle), sin(angle));
    float offset = sin(u_time * 0.7 + i * 1.7) * 0.5;
    float distance = abs(dot(p, normal) - offset);
    float blade = 1.0 - smoothstep(thickness, thickness + max(fwidth(distance), 0.002), distance);
    if (blade > light) blend = mod(i, 2.0);
    light = max(light, blade);
  }

  vec4 color = mix(u_colorA, u_colorB, blend);
  return vec4(color.rgb, color.a * clamp(light, 0.0, 1.0));
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
