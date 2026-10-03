import { defineFilter } from "@difracta/render/sdk";

export const edgeFade = defineFilter({
  id: "edge-fade",
  name: "Edge Fade",
  description:
    "Fades the picture out toward its edges, as a soft rectangle or an oval vignette, so clips blend into each other and into the dark.",
  notes:
    "A soft border for one clip: the picture goes transparent toward its edges, so where two Layers meet, on neighbouring Regions or on overlapping Surfaces, they blend rather than butt, and a clip in the middle of a wall ends in a glow instead of a line. Width is how far in from each edge the fade reaches, as a fraction of the picture; at zero the pass is skipped, at the top of the range it reaches the centre and the whole picture is a soft spot. Shape picks the fall-off: Rectangle fades each edge straight in, keeping the corners square, so two clips side by side cross-fade over a straight band; Oval is a vignette, darkest at the corners, and at the default Width the middle of each edge is still lit, so it reads as a lens rather than a frame. The fade is in the picture's alpha, so it works the same over any blend mode and over any ground. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, where the fade follows the Surface's mapping and Masks; it is per Layer where a Mask's feather is per Surface, which is the point: two clips on the same Surface can fade differently. At the root it fades the projector's whole frame toward its edges, a cheap edge blend for two projectors that overlap, though Masks with feather do that with more control. Stack it last, above Transform or Crop, so the fade is on the picture as placed.",
  parameters: {
    width: {
      kind: "number",
      label: "Width",
      default: 0.15,
      min: 0,
      max: 0.5,
      step: 0.005,
      percent: true,
      description: "How far in from each edge the fade reaches.",
    },
    shape: {
      kind: "choice",
      label: "Shape",
      default: "rectangle",
      options: [
        { value: "rectangle", label: "Rectangle" },
        { value: "oval", label: "Oval" },
      ],
      description: "Rectangle fades each edge straight; Oval is a vignette.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  float coverage;
  if (u_shape == 0) {
    vec2 edge = smoothstep(vec2(0.0), vec2(max(u_width, 1e-4)), min(uv, 1.0 - uv));
    coverage = edge.x * edge.y;
  } else {
    float corner = 1.4142136;
    float distance = length((uv - 0.5) * 2.0);
    coverage = 1.0 - smoothstep(corner * (1.0 - 2.0 * u_width), corner, distance);
  }
  return sample_input(uv) * coverage;
}`,
  create() {
    return {
      update({ params, changed }) {
        return { changed, identity: params.width <= 0 };
      },
    };
  },
});
