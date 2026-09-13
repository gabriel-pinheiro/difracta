import { defineShaderVisual, ticker } from "@difracta/render/sdk";

/** Reshuffles repeat after this many; far beyond what anyone notices. */
const GENERATIONS = 1024;

export const barcodeRunner = defineShaderVisual({
  id: "barcode-runner",
  name: "Barcode Runner",
  description:
    "A barcode of vertical bars scrolls sideways, and its bar widths and gaps are thrown again on every beat of Change Rate.",
  notes:
    "A hard graphic texture for walls and pillars: Density lanes of bars, each a random width up to Fill of its lane, cut into Segments horizontal bands that drop out at random, so the code looks printed and re-printed. Speed scrolls it, negative to the left, and integrates, so it can be swept through zero without a jump. Change Rate is how many times per second the pattern is re-rolled; zero holds one pattern, and a held, unmoving barcode costs nothing. Background defaults to transparent so the bars stand alone over whatever is below; give it a color for a full label. The bar hashes are seeded per Layer, so two Surfaces show different codes. Costs one full-Surface pass per frame while scrolling and one per re-roll otherwise.",
  parameters: {
    color: { kind: "color", label: "Bar Color", default: [1, 1, 1, 1] },
    background: { kind: "color", label: "Background", default: [0, 0, 0, 0] },
    density: {
      kind: "number",
      label: "Density",
      default: 34,
      min: 8,
      max: 100,
      step: 1,
      description: "Lanes across the Surface, one bar each.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.35,
      min: -3,
      max: 3,
      step: 0.05,
    },
    fill: {
      kind: "number",
      label: "Fill",
      default: 0.5,
      min: 0.1,
      max: 0.9,
      step: 0.05,
      percent: true,
      description: "The widest a bar gets, as a share of its lane.",
    },
    segments: {
      kind: "number",
      label: "Segments",
      default: 5,
      min: 1,
      max: 8,
      step: 1,
      description: "Horizontal bands that drop out of a bar independently.",
    },
    changeRate: {
      kind: "number",
      label: "Change Rate",
      default: 4,
      min: 0,
      max: 30,
      step: 0.5,
      unit: "Hz",
    },
  },
  fragment: `
uniform float u_scroll;
uniform float u_generation;
uniform float u_seed;

float barcode_random(float lane, float channel) {
  return hash2(vec2(lane * 7.31 + channel * 131.7, u_generation * 3.17 + u_seed));
}

vec4 render_visual(vec2 uv) {
  float coordinate = uv.x + u_scroll;
  // The code repeats once per Surface width, so the scroll can wrap at one.
  float lane = mod(floor(coordinate * u_density), u_density);
  float within = fract(coordinate * u_density);
  float bar_width = u_fill * mix(0.35, 1.0, barcode_random(lane, 0.0));
  float bar = step(within, bar_width);
  float segment = floor(uv.y * u_segments);
  bar *= step(0.12, barcode_random(lane, segment + 1.0));
  return mix(u_background, u_color, bar);
}`,
  create({ random }) {
    const clock = ticker();
    let scroll = 0;
    let generation = 0;
    const seed = Math.floor(random() * 4096);
    return {
      update({ dt, params, changed }) {
        scroll = (scroll + dt * params.speed) % 1;
        const fired = clock.advance(dt, params.changeRate);
        generation = (generation + fired) % GENERATIONS;
        return {
          changed: changed || params.speed !== 0 || fired > 0,
          uniforms: { scroll, generation, seed },
        };
      },
    };
  },
});
