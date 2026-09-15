import { defineFilter } from "@difracta/render/sdk";

export const chromaticAberration = defineFilter({
  id: "chromatic-aberration",
  name: "Chromatic Aberration",
  description:
    "Pulls the red and blue channels apart more and more toward the edges of the frame, like a cheap lens.",
  notes:
    "A lens defect rather than a glitch: the centre of the frame stays clean and the fringing grows with the cube of the distance out, so it is strongest in the corners. Amount is how far the channels travel there, as a fraction of the frame; at the low end it is a subtle warmth on edges, at the top the corners break into rainbows. The split is radial around the centre of the projector frame, not around each Surface, so a Surface parked in a corner fringes hard while one in the middle barely moves — that asymmetry is the point, and it is what separates this from Signal Distortion's RGB Split, which pulls every pixel apart by the same amount sideways. Nothing is animated, so a still Scene under it costs nothing after the first frame; when it does run it is three samples per pixel. It stacks well under anything: put it below Scanlines and Dither for a whole television-set chain, or over a moving Visual on its own.",
  parameters: {
    amount: {
      kind: "number",
      label: "Amount",
      default: 0.018,
      min: 0,
      max: 0.1,
      step: 0.001,
      description:
        "How far the channels are pulled apart at the corners, as a fraction of the frame.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec2 direction = uv - 0.5;
  vec2 offset = direction * length(direction) * u_amount;
  vec4 center = sample_input(uv);
  vec4 red = sample_input(uv + offset);
  vec4 blue = sample_input(uv - offset);
  return vec4(red.r, center.g, blue.b, max(center.a, max(red.a, blue.a)));
}`,
  create() {
    return {
      update({ params, changed }) {
        return { changed, identity: params.amount <= 0 };
      },
    };
  },
});
