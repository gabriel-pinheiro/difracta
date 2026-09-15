import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Scans in flight at once; the fragment reads this many. */
const MAX_SCANS = 24;

export const scannerShot = defineShaderVisual({
  id: "scanner-shot",
  name: "Scanner Shot",
  description:
    "Every Scan sends a soft-edged bar with a fading trail across the Surface in one direction; scans overlap and add up.",
  recommended: true,
  notes:
    "A hit Visual that reads as a sweep: fire Scan on a snare and a bar crosses the Surface in Travel Duration, entering from outside one edge and leaving past the other. Band Width is the bar's thickness as a share of the way across, Edge Softness feathers it, and Trail is how far behind the head the light lingers, also as a share of the way across; a bar keeps going until its trail has left too. Automatic Rate fires scans on its own for a texture; at zero it is purely played. Two dozen scans can be in flight and they add, so a roll brightens toward white. Direction is fixed per Layer; put two Layers with opposite directions on one Surface for crossing sweeps. Costs nothing between scans and one full-Surface pass per frame while any is crossing. Additive blend mode over a Scene lights it rather than covering it.",
  parameters: {
    color: { kind: "color", label: "Color", default: [0, 0.941, 1, 1] },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "left-to-right",
      options: [
        { value: "left-to-right", label: "Left to Right" },
        { value: "right-to-left", label: "Right to Left" },
        { value: "top-to-bottom", label: "Top to Bottom" },
        { value: "bottom-to-top", label: "Bottom to Top" },
      ],
    },
    travelDuration: {
      kind: "number",
      label: "Travel Duration",
      default: 600,
      min: 50,
      max: 4000,
      step: 50,
      unit: "ms",
    },
    width: {
      kind: "number",
      label: "Band Width",
      default: 0.12,
      min: 0.02,
      max: 0.8,
      step: 0.02,
      percent: true,
      description: "The bar's thickness as a share of the way across.",
    },
    trail: {
      kind: "number",
      label: "Trail",
      default: 0.18,
      min: 0,
      max: 0.8,
      step: 0.02,
      percent: true,
      description: "How far behind the bar the light lingers.",
    },
    softness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.015,
      min: 0,
      max: 0.15,
      step: 0.005,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "scan", label: "Scan" }],
  fragment: `
uniform float u_ages[${String(MAX_SCANS)}];
uniform float u_scan_count;

vec4 render_visual(vec2 uv) {
  float coordinate = u_direction == 0 ? uv.x
    : u_direction == 1 ? 1.0 - uv.x
    : u_direction == 2 ? uv.y
    : 1.0 - uv.y;
  float half_width = u_width * 0.5;
  // The head crosses from just outside one edge to just outside the other in Travel Duration.
  float pace = (1.0 + u_width) / (u_travelDuration / 1000.0);
  float light = 0.0;
  for (int index = 0; index < ${String(MAX_SCANS)}; index += 1) {
    if (float(index) >= u_scan_count) break;
    float head = -half_width + u_ages[index] * pace;
    float behind = head - coordinate;
    float core = 1.0 - smoothstep(half_width - u_softness, half_width + u_softness, abs(behind));
    float trail = behind <= 0.0 || u_trail <= 0.0
      ? 0.0
      : pow(max(0.0, 1.0 - behind / u_trail), 2.0);
    light += max(core, trail);
  }
  return vec4(u_color.rgb, u_color.a * min(light, 1.0));
}`,
  create({ random }) {
    const ages: number[] = [];
    const timer = rateTimer(random);
    const scan = (): void => {
      ages.push(0);
      while (ages.length > MAX_SCANS) ages.shift();
    };
    return {
      cue() {
        scan();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          scan();
        // A scan lives until its head and its trail have both left the far edge.
        const pace = (1 + params.width) / (params.travelDuration / 1000);
        const lifetime = (1 + params.width + params.trail) / pace;
        for (let index = ages.length - 1; index >= 0; index -= 1) {
          const age = (ages[index] ?? 0) + dt;
          if (age >= lifetime) ages.splice(index, 1);
          else ages[index] = age;
        }
        const packed = new Float32Array(MAX_SCANS);
        packed.set(ages);
        return {
          changed: changed || ages.length > 0,
          blank: ages.length === 0,
          uniforms: { ages: packed, scan_count: ages.length },
        };
      },
    };
  },
});
