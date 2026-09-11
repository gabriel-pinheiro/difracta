import { defineFilter, ticker } from "@difracta/render/sdk";

/** Hashes repeat after this many reshuffles; far beyond what anyone notices. */
const GENERATIONS = 1024;

export const tileScramble = defineFilter({
  id: "tile-scramble",
  name: "Tile Scramble",
  description:
    "Cuts everything below into a grid of tiles and throws each one out of place, reshuffling at a steady rate.",
  notes:
    "A hard, rhythmic break-up: every tile shows a different, displaced part of the frame, and the whole arrangement is thrown again on each tick of Rate, so it reads as a stutter more than a smear. Amount is how far tiles travel, as a fraction of the frame; small values keep the picture recognizable, above half it turns abstract. Tiles per Axis sets the grid, and the tiles are square in frame space, so on a tall Surface they look tall. Rate is in ticks per second and can be changed live without a skip. It bleeds across Surfaces: a tile can show a piece of a neighbouring Surface. Costs one full-frame pass; nothing is redrawn between ticks while the Layers below are still.",
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
    tiles: {
      kind: "number",
      label: "Tiles per Axis",
      default: 8,
      min: 2,
      max: 24,
      step: 1,
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 6,
      min: 0.5,
      max: 24,
      step: 0.5,
      unit: "Hz",
    },
  },
  fragment: `
uniform float u_generation;

vec4 filter_image(vec2 uv) {
  vec2 tile = floor(uv * u_tiles);
  float identity = tile.x + tile.y * 97.0 + u_generation * 131.0;
  vec2 shift = vec2(hash(identity), hash(identity + 43.0)) - 0.5;
  return sample_mirrored(uv + shift * u_amount);
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
