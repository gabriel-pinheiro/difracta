import { defineFilter } from "@difracta/render/sdk";

/** Keeps the travelling phase inside one cycle, so it never grows without bound. */
const wrap = (phase: number): number => ((phase % 1) + 1) % 1;

export const waveDistortion = defineFilter({
  id: "wave-distortion",
  name: "Wave Distortion",
  description:
    "Pushes the frame back and forth along a single travelling sine wave, across it or down it.",
  notes:
    "A smooth ripple rather than a glitch: every row (or column) slides by the same sine, so straight edges bend and nothing ever tears. Amount is how far pixels travel, as a fraction of the frame; the default is a gentle heat shimmer and the top of the range makes the picture swim. Waves is how many crests fit across the frame, so few and large reads as a slow swell and many and tight as a corrugation. Speed is in cycles per second and the sign reverses the travel; zero freezes the wave mid-shape, and a frozen wave costs nothing after the frame it settles on. Direction picks the axis: Horizontal slides pixels sideways by a wave that runs down the frame, Vertical slides them up and down by a wave that runs across it. Waves and Direction are measured in the projector frame, so a wave crosses Surface boundaries and neighbouring Surfaces bend together; edges clamp, so a pixel pulled from beyond the frame stretches the last row rather than showing black. Costs one full-frame pass every frame while Speed is not zero. It layers well under Chromatic Aberration and over any Visual with hard edges — Pixel Bar or Barcode Runner, where the bending is obvious.",
  parameters: {
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.025,
      min: 0,
      max: 0.2,
      step: 0.005,
      description:
        "How far pixels travel at a crest, as a fraction of the frame.",
    },
    waves: {
      kind: "number",
      label: "Waves",
      default: 8,
      min: 1,
      max: 30,
      step: 1,
      description: "How many crests fit across the frame.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: -5,
      max: 5,
      step: 0.1,
      unit: "Hz",
      description: "Cycles per second the wave travels; negative reverses it.",
    },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "horizontal",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
  },
  fragment: `
uniform float u_phase;

vec4 filter_image(vec2 uv) {
  float along = u_direction == 0 ? uv.y : uv.x;
  float wave = sin((along * u_waves + u_phase) * 6.2831853) * u_amount;
  vec2 offset = u_direction == 0 ? vec2(wave, 0.0) : vec2(0.0, wave);
  return sample_input(uv + offset);
}`,
  create() {
    let phase = 0;
    return {
      update({ dt, params, changed }) {
        const advance = dt * params.speed;
        phase = wrap(phase + advance);
        return {
          changed: changed || advance !== 0,
          identity: params.amount <= 0,
          uniforms: { phase },
        };
      },
    };
  },
});
