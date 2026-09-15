import { defineFilter, ticker } from "@difracta/render/sdk";

/** Hashes repeat after this many ticks; far beyond what anyone notices. */
const GENERATIONS = 1024;
/** The largest travel, as a fraction of the frame, at Amount 1. */
const REACH = 0.48;

export const sliceShift = defineFilter({
  id: "slice-shift",
  name: "Slice Shift",
  description:
    "Cuts the frame into horizontal slices and throws every one of them sideways, alternating left and right.",
  notes:
    "Total, even destruction: unlike Block Glitch, no slice is spared, and neighbouring slices always travel in opposite directions, so the picture interlaces into a comb instead of drifting. Amount is how far slices travel, as a fraction of the frame; a quarter of the travel is always there even at the shortest throw, so even small values read as a deliberate shred rather than a wobble, and above half the picture stops being readable. Slices is how many strips the frame is cut into: few and tall is a venetian blind, many and thin is a dense weave that keeps the colors but destroys the shapes. Rate is in ticks per second; the arrangement is held between ticks, so nothing is redrawn while a Scene below is still, and a Rate change carries the progress toward the next tick rather than skipping. Slices are cut in the projector frame, so they span Surfaces and carry content from one into the next, and the frame is mirrored at the edges, so no Surface is left with black where a slice travelled off. Costs one full-frame pass on the ticks that change it. It preserves color exactly, which makes it the one to reach for when a Visual's palette matters and its shape does not; stack Block Glitch over it for failure on top of noise, or Scanlines over it to tie the comb back into one screen.",
  parameters: {
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    slices: {
      kind: "number",
      label: "Slices",
      default: 24,
      min: 2,
      max: 96,
      step: 1,
      description: "How many strips the frame is cut into.",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 8,
      min: 0.5,
      max: 30,
      step: 0.5,
      unit: "Hz",
    },
  },
  fragment: `
uniform float u_generation;

vec4 filter_image(vec2 uv) {
  float slice = floor(uv.y * u_slices);
  float polarity = mod(slice, 2.0) * 2.0 - 1.0;
  float travel = polarity * (0.25 + 0.75 * hash(slice + u_generation * 31.0));
  return sample_mirrored(uv + vec2(travel * u_amount * ${REACH}, 0.0));
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
