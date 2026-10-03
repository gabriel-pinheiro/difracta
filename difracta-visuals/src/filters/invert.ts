import { defineFilter } from "@difracta/render/sdk";

export const invert = defineFilter({
  id: "invert",
  name: "Invert",
  description:
    "Turns the picture into its negative; the Layer's Mix sets how far.",
  notes:
    "The negative: every channel is flipped, so black becomes white, a colour becomes its complement and mid-grey stays where it is. It has no Parameters; the Layer's Mix is the amount, and at half Mix the picture collapses toward grey, which is a look of its own. It works in straight alpha, so transparent stays transparent and a soft edge keeps its shape, which is why a clip with a black background inverts to a white clip on nothing, not on white. It always does something, so there is no setting at which it passes through. Nothing is animated: a still picture under it costs nothing after the first frame. Inside a Visual Layer it inverts one clip; at the root it inverts the whole frame, which on an Additive stack mostly means white, so prefer the Layer. Toggle its Enabled from a Macro for a hit, or stack Threshold under it for a white-on-black cut-out turned black-on-white.",
  parameters: {},
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 c = sample_straight(uv);
  return premultiply(vec4(1.0 - c.rgb, c.a));
}`,
});
