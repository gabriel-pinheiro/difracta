import { defineFilter } from "@difracta/render/sdk";

export const pixelCrush = defineFilter({
  id: "pixel-crush",
  name: "Pixel Crush",
  description:
    "Snaps the frame to a coarse grid so everything below turns into large square pixels.",
  notes:
    "A mosaic of the finished picture: each block takes the color of one point of the frame, so detail disappears while the colors and the overall shape survive. Pixel Size is the only control and it is in projector pixels, from 1 (off, and the pass is skipped) up to blocks a quarter of the frame across; around 8 it reads as a low-resolution screen, above 60 the Surface becomes a handful of colored squares. The grid is anchored to the projector frame, not to each Surface, so neighbouring Surfaces share block edges and a Surface that does not sit on a block boundary gets a partial block at its edge; blocks do not sample across Surfaces, since they read the accumulated frame that Surface already occupies. Nothing is animated, so a still Scene under it costs nothing after the first frame, and it is one sample per pixel — the cheapest Filter here. Use the Layer's Mix to fade the crush in and out rather than looking for an Amount. It reads well above Dither and below nothing: put it last so it crushes the whole chain, or below Scanlines when you want the lines to stay sharp over soft blocks.",
  parameters: {
    size: {
      kind: "number",
      label: "Pixel Size",
      default: 32,
      min: 1,
      max: 240,
      step: 1,
      unit: "px",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec2 pixel = uv * u_resolution;
  vec2 snapped = (floor(pixel / u_size) + 0.5) * u_size * u_texel;
  return sample_input(snapped);
}`,
  create() {
    return {
      update({ params, changed }) {
        return { changed, identity: params.size <= 1 };
      },
    };
  },
});
