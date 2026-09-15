import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Rings in flight at once; the fragment reads this many. */
const MAX_WAVES = 24;

interface Wave {
  /** Seconds since the Cue. */
  age: number;
  /** Where the ring sits, as a signed share of the Surface, fixed at the Cue. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export const shockwave = defineShaderVisual({
  id: "shockwave",
  name: "Shockwave",
  description:
    "Every Shockwave expands one glowing ring from a scattered centre and fades it out; rings overlap.",
  notes:
    "An impact Visual: fire Shockwave on a kick and a ring blows out from near the middle over Duration, easing as it goes and fading as it grows. End Radius is how far it reaches, measured against half the shorter side, so above 100% the ring leaves the Surface before it fades. Position Spread scatters each centre away from the middle; at zero every ring is concentric. Thickness is the ring's line in pixels and Glow feathers it outward, a real falloff rather than a blur, so a wide Glow costs the same as none. Automatic Rate fires rings on its own for a texture; at zero it is purely played. Two dozen rings can be in flight and they add, so a fast pattern reads as ripples on water. Costs nothing between rings and one full-Surface pass per frame while any is open. Additive blend mode over a Scene makes it a light on top; pair it with Flash Matrix on the same hit.",
  parameters: {
    color: { kind: "color", label: "Color", default: [0.471, 0.922, 1, 1] },
    duration: {
      kind: "number",
      label: "Duration",
      default: 900,
      min: 100,
      max: 3000,
      step: 50,
      unit: "ms",
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 7,
      min: 1,
      max: 40,
      step: 1,
      unit: "px",
    },
    radius: {
      kind: "number",
      label: "End Radius",
      default: 0.85,
      min: 0.2,
      max: 1.6,
      step: 0.05,
      percent: true,
      description: "How far the ring reaches, against half the shorter side.",
    },
    spread: {
      kind: "number",
      label: "Position Spread",
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How far each centre scatters from the middle.",
    },
    glow: {
      kind: "number",
      label: "Glow",
      default: 0.65,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "shockwave", label: "Shockwave" }],
  fragment: `
uniform vec3 u_waves[${String(MAX_WAVES)}];
uniform float u_wave_count;

vec4 render_visual(vec2 uv) {
  vec2 pixel = uv * u_resolution;
  float shorter = min(u_resolution.x, u_resolution.y);
  float half_thickness = u_thickness * 0.5;
  // Glow is a falloff past the line, about three thicknesses wide at full.
  float falloff = max(0.75, u_glow * u_thickness * 3.0);
  float light = 0.0;
  for (int index = 0; index < ${String(MAX_WAVES)}; index += 1) {
    if (float(index) >= u_wave_count) break;
    float progress = u_waves[index].x / (u_duration / 1000.0);
    if (progress < 0.0 || progress > 1.0) continue;
    vec2 centre = u_resolution * (vec2(0.5) + u_waves[index].yz * u_spread);
    float eased = 1.0 - pow(1.0 - progress, 2.4);
    float radius = shorter * u_radius * 0.5 * eased;
    float band = abs(length(pixel - centre) - radius);
    float ring = 1.0 - smoothstep(half_thickness, half_thickness + falloff, band);
    light += ring * pow(1.0 - progress, 1.25);
  }
  return vec4(u_color.rgb, u_color.a * min(light, 1.0));
}`,
  create({ random }) {
    const waves: Wave[] = [];
    const timer = rateTimer(random);
    const burst = (): void => {
      waves.push({
        age: 0,
        offsetX: random() - 0.5,
        offsetY: random() - 0.5,
      });
      while (waves.length > MAX_WAVES) waves.shift();
    };
    return {
      cue() {
        burst();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          burst();
        const lifetime = params.duration / 1000;
        for (let index = waves.length - 1; index >= 0; index -= 1) {
          const live = waves[index];
          if (live === undefined) continue;
          live.age += dt;
          if (live.age >= lifetime) waves.splice(index, 1);
        }
        // The whole array is set every frame, so the fragment never reads a stale slot.
        const packed = new Float32Array(MAX_WAVES * 3);
        waves.forEach((live, index) =>
          packed.set([live.age, live.offsetX, live.offsetY], index * 3),
        );
        return {
          changed: changed || waves.length > 0,
          blank: waves.length === 0,
          uniforms: {
            waves: { size: 3, values: packed },
            wave_count: waves.length,
          },
        };
      },
    };
  },
});
