import { defineShaderVisual, ticker } from "@difracta/render/sdk";

/** Generations repeat after this many; far beyond what anyone notices. */
const GENERATIONS = 4096;

export const noiseField = defineShaderVisual({
  id: "noise-field",
  name: "Noise Field",
  description:
    "A field of square grains lights up at random over a background and is thrown again on every tick of Rate.",
  notes:
    "Television static, exactly as coarse as you ask for: the Surface is cut into squares of Grain Size pixels and a share of them light up, the whole field re-rolled on each tick of Rate. Grain Size is in Output pixels, so on a big Surface the grain stays the same size on the wall and there are simply more of them; one pixel is true static and sixteen is a chunky mosaic that reads from the back of the room. Density is the share of grains lit, so low values are sparse sparkle over whatever is below and high values nearly fill the Surface with Noise Color. Background defaults to transparent so only the grains land on the Scene; give it a color and the Visual covers the Surface. Rate is ticks per second and is driven by a clock, so moving it live never skips or repeats a generation; at zero the field holds one pattern and costs nothing. The hashes are seeded per Layer, so two Surfaces never show the same static. Good under Scanlines, or as the thing a Mask is cut from. Costs one full-Surface pass per re-roll.",
  parameters: {
    background: { kind: "color", label: "Background", default: [0, 0, 0, 0] },
    noise: { kind: "color", label: "Noise Color", default: [1, 1, 1, 1] },
    grainSize: {
      kind: "number",
      label: "Grain Size",
      default: 4,
      min: 1,
      max: 32,
      step: 1,
      unit: "px",
    },
    density: {
      kind: "number",
      label: "Density",
      default: 0.5,
      min: 0.05,
      max: 1,
      step: 0.05,
      percent: true,
      description: "The share of grains lit at any moment.",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 18,
      min: 0,
      max: 60,
      step: 0.5,
      unit: "Hz",
    },
  },
  fragment: `
uniform float u_generation;
uniform float u_seed;

// A three-component hash: the prelude's two-component one leaves diagonal
// structure across a grid this regular, which reads as a weave, not static.
float grain(vec2 cell, float generation) {
  vec3 seeded = fract(vec3(cell, generation) * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

vec4 render_visual(vec2 uv) {
  vec2 cell = floor(uv * u_resolution / max(u_grainSize, 1.0));
  float value = grain(cell, u_generation + u_seed);
  float edge = max(0.002, fwidth(value));
  float lit = smoothstep(1.0 - u_density - edge, 1.0 - u_density + edge, value);
  return mix(u_background, u_noise, lit);
}`,
  create({ random }) {
    const clock = ticker();
    let generation = 0;
    const seed = Math.floor(random() * 4096);
    return {
      update({ dt, params, changed }) {
        const fired = clock.advance(dt, params.rate);
        generation = (generation + fired) % GENERATIONS;
        return {
          changed: changed || fired > 0,
          blank: params.background[3] <= 0 && params.noise[3] <= 0,
          uniforms: { generation, seed },
        };
      },
    };
  },
});
