import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Bursts in flight at once; the fragment reads this many. */
const MAX_BURSTS = 24;

interface Burst {
  /** Seconds since the Cue. */
  age: number;
  /** Which grains this burst picks, fixed at the Cue. */
  readonly seed: number;
  /** How many times the grain has been re-rolled, counted from Rate. */
  generation: number;
  /** Progress toward the next generation, so a live Rate change never skips one. */
  budget: number;
}

export const noiseBurst = defineShaderVisual({
  id: "noise-burst",
  name: "Noise Burst",
  description:
    "Every Burst fills the Surface with block-sized random noise that re-rolls rapidly and fades; bursts overlap.",
  notes:
    "A hit Visual for breakdowns and glitch stabs: fire Burst and a field of square grains appears at once, re-rolling Rate times a second, holding for Hold and fading over Fade Out. Grain Size is the block in pixels, so it stays the same size whatever the Surface's resolution; Density is the share of grains lit at any moment. Each burst carries its own re-roll count, which is integrated rather than derived from its age, so turning Rate up or down mid-burst changes how fast the next grain lands and never skips or repeats a pattern. Two dozen bursts can be in flight; each picks its own grains and the brightest wins per pixel, so overlapping bursts thicken the noise instead of flattening it to a solid. Automatic Rate bursts on its own for a texture; at zero it is purely played. Costs nothing between bursts and one full-Surface pass per frame while any is on. Additive blend mode over a Scene reads as interference; stack a Dither or Scanlines Filter over it for a broken-signal look.",
  parameters: {
    color: { kind: "color", label: "Noise Color", default: [1, 1, 1, 1] },
    grainSize: {
      kind: "number",
      label: "Grain Size",
      default: 5,
      min: 1,
      max: 32,
      step: 1,
      unit: "px",
    },
    density: {
      kind: "number",
      label: "Density",
      default: 0.55,
      min: 0.05,
      max: 1,
      step: 0.05,
    },
    hold: {
      kind: "number",
      label: "Hold",
      default: 80,
      min: 0,
      max: 1000,
      step: 10,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 450,
      min: 0,
      max: 3000,
      step: 10,
      unit: "ms",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 30,
      min: 1,
      max: 60,
      step: 1,
      unit: "/s",
      description: "How many times a second the grain is re-rolled.",
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "burst", label: "Burst" }],
  fragment: `
uniform vec3 u_bursts[${String(MAX_BURSTS)}];
uniform float u_burst_count;

// Integer mixing, so a grain far from the origin is as random as one near it.
float grain_random(vec2 grain, float key) {
  uint value = (uint(int(grain.x) + 8192) * 0x9e3779b9u)
    ^ (uint(int(grain.y) + 8192) * 0x85ebca6bu)
    ^ (uint(key) * 0xc2b2ae35u);
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  // Keep 24 bits so conversion to float stays exact and never rounds to 1.
  return float(value >> 8u) / 16777216.0;
}

vec4 render_visual(vec2 uv) {
  float hold = u_hold / 1000.0;
  float fade = u_fadeOut / 1000.0;
  vec2 grain = floor(uv * u_resolution / max(1.0, u_grainSize));
  float threshold = 1.0 - u_density;
  float light = 0.0;
  for (int index = 0; index < ${String(MAX_BURSTS)}; index += 1) {
    if (float(index) >= u_burst_count) break;
    float age = u_bursts[index].x;
    float envelope = age <= hold
      ? 1.0
      : (fade <= 0.0 ? 0.0 : 1.0 - smoothstep(0.0, fade, age - hold));
    if (envelope <= 0.0) continue;
    float key = u_bursts[index].y * 4096.0 + u_bursts[index].z;
    if (grain_random(grain, key) < threshold) continue;
    // The brightest live burst wins, so overlapping bursts thicken the noise.
    light = max(light, envelope);
  }
  return vec4(u_color.rgb, u_color.a * light);
}`,
  create({ random }) {
    const bursts: Burst[] = [];
    const timer = rateTimer(random);
    const start = (): void => {
      bursts.push({
        age: 0,
        seed: Math.floor(random() * 4096),
        generation: 0,
        budget: 0,
      });
      while (bursts.length > MAX_BURSTS) bursts.shift();
    };
    return {
      cue() {
        start();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          start();
        const lifetime = (params.hold + params.fadeOut) / 1000;
        let rolled = false;
        for (let index = bursts.length - 1; index >= 0; index -= 1) {
          const live = bursts[index];
          if (live === undefined) continue;
          live.age += dt;
          live.budget += dt * params.rate;
          const steps = Math.floor(live.budget);
          if (steps > 0) {
            live.budget -= steps;
            // Wrapped so the key stays exact as a float, whatever the burst's length.
            live.generation = (live.generation + steps) % 4096;
            rolled = true;
          }
          if (live.age >= lifetime) bursts.splice(index, 1);
        }
        // The whole array is set every frame, so the fragment never reads a stale slot.
        const packed = new Float32Array(MAX_BURSTS * 3);
        bursts.forEach((live, index) =>
          packed.set([live.age, live.seed, live.generation], index * 3),
        );
        return {
          changed: changed || rolled || bursts.length > 0,
          blank: bursts.length === 0,
          uniforms: {
            bursts: { size: 3, values: packed },
            burst_count: bursts.length,
          },
        };
      },
    };
  },
});
