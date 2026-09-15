import { defineFilter } from "@difracta/render/sdk";

/** Keeps the band's position inside one trip down the frame. */
const wrap = (position: number): number => ((position % 1) + 1) % 1;

export const rollingTvTear = defineFilter({
  id: "rolling-tv-tear",
  name: "Rolling TV Tear",
  description:
    "Rolls a single soft-edged band down the frame, dragging whatever it crosses sideways.",
  notes:
    "One defect travelling through an otherwise clean picture: outside the band nothing is touched at all, and inside it the picture is pulled sideways with a soft shoulder, so it reads as a badly tracked tape rather than as noise. Speed is trips down the frame per second and the sign sends the band up instead; zero parks it where it is, and a parked band costs nothing after the frame it settles on, which makes it useful as a fixed tear as well as a rolling one. Amount is how far the band drags, as a fraction of the frame, and it is also the switch: at zero the pass is skipped. Band Height is how tall the band is as a share of the frame; the inner third is dragged the full Amount and the rest is the fade, so a tall band is a slow swell and a short one a sharp seam. The band spans the whole projector frame and wraps top to bottom, so it crosses every Surface in turn and drags content out of one Surface toward the next; edges clamp, so the row it drags off the side stretches rather than showing black. Costs one full-frame pass every frame while Speed is not zero. It is the one to stack over a legible Visual — text-like Pixel Bar or Barcode Runner — where a single passing tear is read as damage; under Scanlines it completes a broken-television chain.",
  parameters: {
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.25,
      min: -2,
      max: 2,
      step: 0.05,
      unit: "/s",
      description:
        "Trips down the frame per second; negative rolls the band up.",
    },
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.08,
      min: 0,
      max: 0.4,
      step: 0.01,
      description:
        "How far the band drags the picture, as a fraction of the frame.",
    },
    bandHeight: {
      kind: "number",
      label: "Band Height",
      default: 0.12,
      min: 0.02,
      max: 0.5,
      step: 0.01,
      percent: true,
      description: "How tall the band is, as a share of the frame.",
    },
  },
  fragment: `
uniform float u_center;

vec4 filter_image(vec2 uv) {
  float from_center = abs(fract(uv.y - u_center + 0.5) - 0.5);
  float band = 1.0 - smoothstep(u_bandHeight * 0.35, u_bandHeight, from_center);
  return sample_input(uv + vec2(band * u_amount, 0.0));
}`,
  create() {
    let center = 0;
    return {
      update({ dt, params, changed }) {
        const advance = dt * params.speed;
        center = wrap(center + advance);
        return {
          changed: changed || advance !== 0,
          identity: params.amount <= 0,
          uniforms: { center },
        };
      },
    };
  },
});
