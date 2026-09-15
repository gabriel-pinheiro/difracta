import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Wipes in flight at once; the fragment reads this many. */
const MAX_WIPES = 24;

/** The option order is the index the fragment dispatches on. */
export const WIPE_DIRECTIONS = [
  { value: "left-to-right", label: "Left to Right" },
  { value: "right-to-left", label: "Right to Left" },
  { value: "top-to-bottom", label: "Top to Bottom" },
  { value: "bottom-to-top", label: "Bottom to Top" },
] as const;

export const colorWipe = defineShaderVisual({
  id: "color-wipe",
  name: "Color Wipe",
  description:
    "Every Wipe fills the Surface from one edge to the other, holds, then fades; wipes overlap.",
  notes:
    "A hit Visual that covers rather than sparkles: fire Wipe and a soft-edged front crosses the Surface in Travel, filling behind it, waits Hold with everything covered, then fades over Fade Out. Edge Softness feathers the front; at zero it is a hard cut. Direction is fixed per Layer. Wipes overlap: a second Wipe fired while the first is fading re-covers what the first was giving up, and the brightest of the live wipes wins at each pixel, so stacking them never washes past the Color's own alpha. Two dozen can be in flight. Automatic Rate wipes on its own for a texture; at zero it is purely played. Costs nothing between wipes and one full-Surface pass per frame while any is on. Over a Scene this is a curtain, so Normal blend mode reads as a cut and Additive as a flash; drop the Color's alpha for a tint rather than a cover.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "left-to-right",
      options: WIPE_DIRECTIONS,
    },
    travel: {
      kind: "number",
      label: "Travel",
      default: 700,
      min: 50,
      max: 4000,
      step: 50,
      unit: "ms",
      description: "How long the front takes to cross the Surface.",
    },
    edgeSoftness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.025,
      min: 0,
      max: 0.25,
      step: 0.005,
    },
    hold: {
      kind: "number",
      label: "Hold",
      default: 120,
      min: 0,
      max: 2000,
      step: 20,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 300,
      min: 0,
      max: 2000,
      step: 20,
      unit: "ms",
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "wipe", label: "Wipe" }],
  fragment: `
uniform float u_ages[${String(MAX_WIPES)}];
uniform float u_wipe_count;

vec4 render_visual(vec2 uv) {
  float coordinate = u_direction == 0 ? uv.x
    : u_direction == 1 ? 1.0 - uv.x
    : u_direction == 2 ? uv.y
    : 1.0 - uv.y;
  float travel = u_travel / 1000.0;
  float hold = u_hold / 1000.0;
  float fade = u_fadeOut / 1000.0;
  float cover = 0.0;
  for (int index = 0; index < ${String(MAX_WIPES)}; index += 1) {
    if (float(index) >= u_wipe_count) break;
    float age = u_ages[index];
    float progress = clamp(age / travel, 0.0, 1.0);
    float fill = 1.0 - smoothstep(
      progress - u_edgeSoftness,
      progress + u_edgeSoftness,
      coordinate
    );
    float alpha = 1.0;
    if (age > travel + hold)
      alpha = fade <= 0.0 ? 0.0 : 1.0 - smoothstep(0.0, fade, age - travel - hold);
    // The brightest live wipe wins, so overlapping wipes never over-cover.
    cover = max(cover, fill * max(0.0, alpha));
  }
  return vec4(u_color.rgb, u_color.a * cover);
}`,
  create({ random }) {
    const ages: number[] = [];
    const timer = rateTimer(random);
    const wipe = (): void => {
      ages.push(0);
      while (ages.length > MAX_WIPES) ages.shift();
    };
    return {
      cue() {
        wipe();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          wipe();
        const lifetime = (params.travel + params.hold + params.fadeOut) / 1000;
        for (let index = ages.length - 1; index >= 0; index -= 1) {
          const age = (ages[index] ?? 0) + dt;
          if (age >= lifetime) ages.splice(index, 1);
          else ages[index] = age;
        }
        const packed = new Float32Array(MAX_WIPES);
        packed.set(ages);
        return {
          changed: changed || ages.length > 0,
          blank: ages.length === 0,
          uniforms: { ages: packed, wipe_count: ages.length },
        };
      },
    };
  },
});
