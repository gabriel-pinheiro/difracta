import { defineFilter } from "@difracta/render/sdk";

export const dither = defineFilter({
  id: "dither",
  name: "Dither",
  description:
    "Crushes the frame to a handful of color levels and hides the banding under a visible ordered pixel pattern.",
  notes:
    "The retro-screen look: everything below is reduced to a few levels per channel, and the error is spread over an ordered pattern, so flat washes break into speckle and gradients into a dotted ramp. Color Levels is the palette depth per channel; 2 is a hard poster, 5 is the classic game-console read, and above 10 the pattern all but disappears. Pixel Size is how large a cell of the pattern is in projector pixels, so it stays the same size on a Surface however big that Surface is; on a low-resolution Output leave it at 1 or 2, on a large one push it up until the speckle is visible from the floor. Monochrome drops the color first, giving a one-bit screen. It always does something — there is no setting at which it passes through, so reach for the Layer's Mix to ease it in. It does not move anything, so a still Scene under it costs nothing after the first frame; it only redraws when a Parameter changes. Stack it last, above the displacement Filters, so it dithers the final picture rather than getting smeared; over a Gradient it is the cheapest way to make a soft wash look like hardware.",
  parameters: {
    levels: {
      kind: "number",
      label: "Color Levels",
      default: 5,
      min: 2,
      max: 16,
      step: 1,
      description: "How many values each channel is allowed.",
    },
    pixels: {
      kind: "number",
      label: "Pixel Size",
      default: 2,
      min: 1,
      max: 8,
      step: 1,
      unit: "px",
      description: "How large one cell of the pattern is on the Output.",
    },
    monochrome: {
      kind: "boolean",
      label: "Monochrome",
      default: false,
      description: "Throw the color away and dither the brightness alone.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 source = sample_input(uv);
  vec2 cell = floor(uv * u_resolution / u_pixels);
  float threshold = fract(dot(cell, vec2(0.5, 0.75))) - 0.5;
  vec3 color = source.rgb;
  if (u_monochrome) color = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
  float steps = u_levels - 1.0;
  vec3 crushed = clamp(
    floor(color * steps + 0.5 + threshold) / steps,
    0.0,
    source.a
  );
  return vec4(crushed, source.a);
}`,
});
