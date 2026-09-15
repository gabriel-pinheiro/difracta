import { defineFilter, ticker } from "@difracta/render/sdk";

/** The zoom held between punches, as a share of Amount. */
const HOLD = 0.4;
/** What a punch adds on top of the hold, as a share of Amount. */
const PUNCH = 3.6;

export const punchZoom = defineFilter({
  id: "punch-zoom",
  name: "Punch Zoom",
  description:
    "Slams into the picture on every beat and eases back out, holding a little closer in between.",
  notes:
    "The hit accent: on each tick the frame jumps toward the viewer and then falls back along a cubic ease, so the attack is instant and the recovery is long — the opposite shape to Impact Shake, which holds still and then moves. Amount is how hard it punches; it also sets the resting zoom, a fifth of the punch, so any Amount above zero leaves the picture slightly closer than it was even between hits, and at zero the pass is skipped. Rate is in punches per second, and zero is a useful setting on its own: it stops the punching and leaves that steady zoom-in, a still push worth automating from a Controller. A Rate change carries the progress through the current recovery, so the picture never jumps when you speed it up. It magnifies around the centre of the projector frame, not around each Surface, so a Surface off to one side swings across the frame as it zooms while one in the middle only grows; content is pulled in from beyond a Surface's own pixels, so neighbouring Surfaces bleed into each other at the top of the punch. Costs one full-frame pass every frame while it is recovering, and nothing at all once it has settled at Rate zero. Stack Impact Shake over it for a hit that both lunges and rattles, or Chromatic Aberration over it so the corners fringe hardest at the peak.",
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
      default: 2,
      min: 0,
      max: 12,
      step: 0.25,
      unit: "Hz",
      description: "Punches per second; zero holds the resting zoom instead.",
    },
  },
  fragment: `
uniform float u_zoom;

vec4 filter_image(vec2 uv) {
  return sample_input((uv - 0.5) / u_zoom + 0.5);
}`,
  create() {
    const clock = ticker();
    let last = Number.NaN;
    return {
      update({ dt, params, changed }) {
        clock.advance(dt, params.rate);
        const recovery = 1 - clock.phase;
        const pulse = params.rate > 0 ? recovery * recovery * recovery : 0;
        const zoom = 1 + params.amount * (HOLD + PUNCH * pulse);
        const moved = zoom !== last;
        last = zoom;
        return {
          changed: changed || moved,
          identity: params.amount <= 0,
          uniforms: { zoom },
        };
      },
    };
  },
});
