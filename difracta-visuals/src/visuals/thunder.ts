import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
  smoothstep,
  type Random,
} from "@difracta/render/sdk";

interface Flash {
  /** Seconds after the burst started. */
  readonly start: number;
  readonly duration: number;
  readonly strength: number;
  /** How long the light lingers after the flash. */
  readonly tail: number;
}

interface Burst {
  readonly flashes: readonly Flash[];
  readonly lifetime: number;
  age: number;
}

/** Ms Parameters as seconds. */
const seconds = (ms: number): number => ms / 1000;

function makeBurst(
  random: Random,
  params: {
    readonly flashCount: number;
    readonly flashDuration: number;
    readonly flashSpacing: number;
    readonly fadeOut: number;
  },
): Burst {
  const count = Math.max(1, Math.min(8, Math.round(params.flashCount)));
  const spacing = seconds(params.flashSpacing);
  const duration = seconds(params.flashDuration);
  const fadeOut = seconds(params.fadeOut);
  const flashes: Flash[] = [];
  for (let index = 0; index < count; index += 1) {
    const jitter = index === 0 ? 0 : (random() - 0.5) * spacing * 0.34;
    const final = index === count - 1;
    flashes.push({
      start: index * spacing + jitter,
      duration: duration * (0.62 + random() * 0.73),
      strength: index === 0 ? 1 : 0.48 + random() * 0.52,
      tail: final
        ? fadeOut
        : Math.min(
            fadeOut * 0.22,
            Math.max(0.015, (spacing - duration) * 0.65),
          ),
    });
  }
  const lifetime = Math.max(
    ...flashes.map((flash) => flash.start + flash.duration + flash.tail),
  );
  return { flashes, lifetime, age: 0 };
}

function burstAlpha(burst: Burst): number {
  let alpha = 0;
  for (const flash of burst.flashes) {
    const local = burst.age - flash.start;
    if (local < 0) continue;
    const attack = Math.min(0.012, flash.duration * 0.3);
    let value = smoothstep(0, Math.max(0.001, attack), local);
    if (local > flash.duration)
      value *=
        1 -
        smoothstep(
          flash.duration,
          flash.duration + Math.max(0.001, flash.tail),
          local,
        );
    alpha = Math.max(alpha, value * flash.strength);
  }
  return alpha;
}

export const thunder = defineShaderVisual({
  id: "thunder",
  name: "Thunder",
  description:
    "Lightning: a burst of a few irregular flat flashes with a lingering fade, on every Flash Cue or on its own at an Automatic Rate.",
  recommended: true,
  notes:
    "Reads as distant lightning on a wall or a ceiling. Each burst is Flashes quick strikes spaced by Flash Spacing with a little random jitter, each Flash Duration long and the last one lingering for Fade Out. Automatic Rate fires bursts on its own, jittered around the mean, and Flash fires one on demand; both overlap freely, the brightest strike showing. The Cue starts a burst with the Parameters as they are at that moment. Intensity scales the whole thing without touching Color's alpha, which is what a Controller should ride. Additive blend mode over a Scene lights it up rather than covering it. Costs nothing between bursts and one full-Surface shader pass while one is lit.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    intensity: {
      kind: "number",
      label: "Intensity",
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    flashCount: {
      kind: "number",
      label: "Flashes",
      default: 3,
      min: 1,
      max: 8,
      step: 1,
    },
    flashDuration: {
      kind: "number",
      label: "Flash Duration",
      default: 60,
      min: 10,
      max: 500,
      step: 10,
      unit: "ms",
    },
    flashSpacing: {
      kind: "number",
      label: "Flash Spacing",
      default: 160,
      min: 40,
      max: 1000,
      step: 10,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 350,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    automaticRate: automaticRate({ default: 0.125, max: 4, step: 0.025 }),
  },
  cues: [{ key: "flash", label: "Flash" }],
  fragment: `
uniform float u_alpha;

vec4 render_visual(vec2 uv) {
  return vec4(u_color.rgb, u_color.a * u_alpha);
}`,
  create({ random, params: initial }) {
    const timer = rateTimer(random);
    const bursts: Burst[] = [];
    let params = initial;
    let lastAlpha = -1;
    return {
      cue() {
        bursts.push(makeBurst(random, params));
      },
      update(frame) {
        params = frame.params;
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          bursts.push(makeBurst(random, params));
        let alpha = 0;
        for (let index = bursts.length - 1; index >= 0; index -= 1) {
          const burst = bursts[index];
          if (burst === undefined) continue;
          burst.age += frame.dt;
          if (burst.age >= burst.lifetime) {
            bursts.splice(index, 1);
            continue;
          }
          alpha = Math.max(alpha, burstAlpha(burst));
        }
        alpha *= params.intensity;
        const moved = alpha !== lastAlpha;
        lastAlpha = alpha;
        return {
          changed: frame.changed || moved,
          blank: alpha <= 0,
          uniforms: { alpha },
        };
      },
    };
  },
});
