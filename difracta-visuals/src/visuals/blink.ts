import { defineShaderVisual, smoothstep } from "@difracta/render/sdk";

/**
 * The alpha of one blink at `age` seconds: nothing during the delay, a
 * fade in, a hold, a fade out; every duration in seconds here.
 */
function envelope(
  age: number,
  delay: number,
  fadeIn: number,
  hold: number,
  fadeOut: number,
): number {
  if (age < delay) return 0;
  const inFade = age - delay;
  if (inFade < fadeIn) return smoothstep(0, fadeIn, inFade);
  const inHold = inFade - fadeIn;
  if (inHold < hold) return 1;
  const inOut = inHold - hold;
  return fadeOut > 0 && inOut < fadeOut ? 1 - smoothstep(0, fadeOut, inOut) : 0;
}

export const blink = defineShaderVisual({
  id: "blink",
  name: "Blink",
  description:
    "A flat color flash on every Blink Cue: a delay, a fade in, a hold and a fade out, with an optional chance of not firing.",
  notes:
    "The simplest Cue Visual: nothing until Blink fires, then Color over the whole Target with the envelope the durations describe. Hold at 100 ms with no fades is a hard hit for drums; fades of a few hundred ms make it a swell. Delay staggers several Layers fired by one Macro. Trigger Chance below 100% lets some hits through and drops others at random, which keeps a fast pattern from feeling mechanical. Blinks overlap: a Cue during a fade starts another blink and the brighter of the two shows, so retriggering never cuts a flash short. Costs nothing between blinks and one full-Surface shader pass while one is visible. Additive blend mode on a colored Layer makes it a light on top of everything.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    delay: {
      kind: "number",
      label: "Delay",
      default: 0,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    fadeIn: {
      kind: "number",
      label: "Fade In",
      default: 0,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    hold: {
      kind: "number",
      label: "Hold",
      default: 100,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 0,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    chance: {
      kind: "number",
      label: "Trigger Chance",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
  },
  cues: [{ key: "blink", label: "Blink" }],
  fragment: `
uniform float u_alpha;

vec4 render_visual(vec2 uv) {
  return vec4(u_color.rgb, u_color.a * u_alpha);
}`,
  create({ random, params: initial }) {
    /** Ages in seconds of the blinks in flight. */
    const blinks: number[] = [];
    let chance = initial.chance;
    let lastAlpha = -1;
    return {
      cue() {
        if (random() < chance) blinks.push(0);
      },
      update({ dt, params, changed }) {
        chance = params.chance;
        const delay = params.delay / 1000;
        const fadeIn = params.fadeIn / 1000;
        const hold = params.hold / 1000;
        const fadeOut = params.fadeOut / 1000;
        const lifetime = delay + fadeIn + hold + fadeOut;
        let alpha = 0;
        for (let index = blinks.length - 1; index >= 0; index -= 1) {
          const age = (blinks[index] ?? 0) + dt;
          if (age >= lifetime) {
            blinks.splice(index, 1);
            continue;
          }
          blinks[index] = age;
          alpha = Math.max(alpha, envelope(age, delay, fadeIn, hold, fadeOut));
        }
        const moved = alpha !== lastAlpha;
        lastAlpha = alpha;
        return {
          changed: changed || moved,
          blank: alpha <= 0,
          uniforms: { alpha },
        };
      },
    };
  },
});
