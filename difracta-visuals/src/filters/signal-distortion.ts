import { defineFilter } from "@difracta/render/sdk";

/** Noise ticks wrap here, matched in the fragment, so the phase never grows without bound. */
const TICKS = 4096;

export const signalDistortion = defineFilter({
  id: "signal-distortion",
  name: "Signal Distortion",
  description:
    "Tears the frame into horizontal bands that drift sideways like a bad video signal, continuously.",
  notes:
    "A broken-transmission look: fine bands and a few coarse ones slide left and right by smoothly changing random amounts, so the picture wobbles and tears without ever cutting hard. Amount is how far bands travel, as a fraction of the frame; the default is a nervous flicker, the top of the range shreds the picture. Bands is how many strips the frame is cut into; fewer gives broad tears, more gives a fine shimmer. Speed is how fast the noise evolves, and zero freezes the tear in place, still costing nothing while frozen. RGB Split pulls the red and blue channels apart sideways for a chromatic fringe; it costs two more samples per pixel, and at zero with Amount at zero the Filter passes through. Bands are horizontal in the projector frame, not per Surface, and content slides out of one Surface into the next. Edges clamp, so a band pulled from beyond the frame stretches the last pixel. Costs one full-frame pass every frame while Speed is above zero.",
  parameters: {
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.06,
      min: 0,
      max: 0.3,
      step: 0.005,
    },
    bands: {
      kind: "number",
      label: "Bands",
      default: 48,
      min: 4,
      max: 180,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 12,
      min: 0,
      max: 30,
      step: 0.5,
    },
    rgbSplit: {
      kind: "number",
      label: "RGB Split",
      default: 0.008,
      min: 0,
      max: 0.05,
      step: 0.001,
      description:
        "How far red and blue are pulled apart, as a fraction of the frame.",
    },
  },
  fragment: `
uniform float u_fine_phase;
uniform float u_coarse_phase;

float signal_noise(float band, float time) {
  float tick = floor(time);
  float blend = smoothstep(0.0, 1.0, fract(time));
  return mix(
    hash2(vec2(band, mod(tick, ${TICKS}.0))),
    hash2(vec2(band, mod(tick + 1.0, ${TICKS}.0))),
    blend
  );
}

vec4 filter_image(vec2 uv) {
  float fine_band = floor(uv.y * u_bands);
  float coarse_bands = max(2.0, floor(u_bands * 0.125));
  float coarse_band = floor(uv.y * coarse_bands);
  float fine_noise = signal_noise(fine_band, u_fine_phase);
  float coarse_noise = signal_noise(coarse_band + 193.0, u_coarse_phase);
  float displacement =
    ((fine_noise - 0.5) * 1.4 + (coarse_noise - 0.5) * 0.6) * u_amount;
  vec2 displaced = uv + vec2(displacement, 0.0);
  vec4 center = sample_input(displaced);
  if (u_rgbSplit <= 0.0) return center;
  vec4 red = sample_input(displaced + vec2(u_rgbSplit, 0.0));
  vec4 blue = sample_input(displaced - vec2(u_rgbSplit, 0.0));
  float alpha = max(center.a, max(red.a, blue.a));
  return vec4(red.r, center.g, blue.b, alpha);
}`,
  create() {
    let fine = 0;
    let coarse = 0;
    return {
      update({ dt, params, changed }) {
        const advance = dt * params.speed;
        fine = (fine + advance) % TICKS;
        coarse = (coarse + advance * 0.37) % TICKS;
        return {
          changed: changed || advance > 0,
          identity: params.amount <= 0 && params.rgbSplit <= 0,
          uniforms: { fine_phase: fine, coarse_phase: coarse },
        };
      },
    };
  },
});
