import {
  defineFilter,
  smoothstep,
  ticker,
  type Random,
} from "@difracta/render/sdk";

/** The largest displacement, as a fraction of the frame, at Amount 1. */
const REACH = 0.32;
/** Part of each tick spent holding still before the move to the next spot. */
const HOLD = 0.65;

type Offset = readonly [number, number];

const spot = (random: Random): Offset => [random() - 0.5, random() - 0.5];

export const impactShake = defineFilter({
  id: "impact-shake",
  name: "Impact Shake",
  description:
    "Throws the whole frame to a new spot on every beat of Rate, holding still between hits, with its colors untouched.",
  notes:
    "A mechanical camera shake for hits and drops: the frame holds, then snaps to a new random position in the last third of each tick, so it reads as impacts rather than jitter. Amount is how far it can travel, as a fraction of the frame; around a third is a firm knock, full is violent. Rate is in hits per second and changes live without a skip. The frame is mirrored at the edges, so nothing black is exposed and every Surface keeps its pixels, only moved; overlapping Surfaces shake as one. Costs one full-frame pass, and nothing is redrawn while the frame holds still.",
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
    rate: {
      kind: "number",
      label: "Rate",
      default: 12,
      min: 1,
      max: 30,
      step: 0.5,
      unit: "Hz",
    },
  },
  fragment: `
uniform vec2 u_offset;

vec4 filter_image(vec2 uv) {
  return sample_mirrored(uv + u_offset);
}`,
  create({ random }) {
    const clock = ticker();
    let from: Offset = [0, 0];
    let to = spot(random);
    let last: Offset = [Number.NaN, Number.NaN];
    return {
      update({ dt, params, changed }) {
        if (clock.advance(dt, params.rate) > 0) {
          from = to;
          to = spot(random);
        }
        const ease = smoothstep(HOLD, 1, clock.phase);
        const reach = params.amount * REACH;
        const offset: Offset = [
          (from[0] + (to[0] - from[0]) * ease) * reach,
          (from[1] + (to[1] - from[1]) * ease) * reach,
        ];
        const moved = offset[0] !== last[0] || offset[1] !== last[1];
        last = offset;
        return {
          changed: changed || moved,
          identity: params.amount <= 0,
          uniforms: { offset },
        };
      },
    };
  },
});
