import { defineFilter, ticker } from "@difracta/render/sdk";

/** Hashes repeat after this many ticks; far beyond what anyone notices. */
const GENERATIONS = 1024;

export const blockGlitch = defineFilter({
  id: "block-glitch",
  name: "Block Glitch",
  description:
    "Picks a few horizontal rows at a time and throws them sideways, choosing new ones on every tick.",
  notes:
    "Damaged-data rather than damaged-signal: most of the frame is left exactly alone and roughly a quarter of the rows jump sideways by a hard, constant amount for the length of one tick, so it reads as dropped blocks and not as a smear. Amount is how far a chosen row travels, as a fraction of the frame; small values look like a compression artefact, the top of the range throws rows clear across. Rows is how many strips the frame is cut into, and it sets the size of a block: few and tall is a slab breaking loose, many and thin is a rain of slivers. Rate is in ticks per second and is what makes it feel unstable — low rates give a picture that sticks in a broken state, high rates a continuous churn; the choice is held between ticks, so nothing is redrawn while a Scene below is still, and a Rate change carries the progress toward the next tick, never a skip. Rows are cut in the projector frame, so a block spans Surfaces and slides content from one Surface toward the next; edges clamp, so a row pulled from beyond the frame stretches its last pixel. Costs one full-frame pass on the ticks that change it. Use it where Signal Distortion is too continuous: stacked over Slice Shift it is the difference between the picture breaking up and the picture failing.",
  parameters: {
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.08,
      min: 0,
      max: 0.4,
      step: 0.01,
      description: "How far a chosen row travels, as a fraction of the frame.",
    },
    rows: {
      kind: "number",
      label: "Rows",
      default: 12,
      min: 2,
      max: 40,
      step: 1,
      description: "How many strips the frame is cut into.",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 8,
      min: 1,
      max: 30,
      step: 1,
      unit: "Hz",
    },
  },
  fragment: `
uniform float u_generation;

vec4 filter_image(vec2 uv) {
  float row = floor(uv.y * u_rows);
  float gate = step(0.72, hash2(vec2(row, u_generation)));
  float shift =
    (hash2(vec2(row + 19.0, u_generation)) - 0.5) * 2.0 * u_amount * gate;
  return sample_input(uv + vec2(shift, 0.0));
}`,
  create() {
    const clock = ticker();
    let generation = 0;
    return {
      update({ dt, params, changed }) {
        const fired = clock.advance(dt, params.rate);
        generation = (generation + fired) % GENERATIONS;
        return {
          changed: changed || fired > 0,
          identity: params.amount <= 0,
          uniforms: { generation },
        };
      },
    };
  },
});
