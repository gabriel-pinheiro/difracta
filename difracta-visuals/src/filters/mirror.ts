import { defineFilter } from "@difracta/render/sdk";

export const mirror = defineFilter({
  id: "mirror",
  name: "Mirror",
  description:
    "Reflects one half of the picture onto the other, across the middle, on one axis or both.",
  notes:
    "A hard symmetry: the picture is folded at its centre line and the kept half is drawn on both sides, so a clip becomes a butterfly and a diagonal becomes a chevron. Axis picks the fold: Horizontal mirrors left and right, Vertical mirrors top and bottom, Both does both and leaves one quarter repeated four times. Keep says which half survives, Left or Top against Right or Bottom, read on the axis in use; with Both it keeps the quarter where the two meet. Nothing is sampled across the fold, so the seam is exact and costs nothing to hide. It always does something, so there is no setting at which it passes through; use the Layer's Enabled or Mix to drop it. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, where it folds the clip on its own wall and follows the Surface's mapping, so a clip on a skewed Surface mirrors about the clip's centre, not the projector's; at the root it folds the whole frame, which copies one Surface onto the far side of the room, a different trick. Stack Kaleido instead for more than one fold, or Transform under it to choose which part of the clip ends up on the fold.",
  parameters: {
    axis: {
      kind: "choice",
      label: "Axis",
      default: "horizontal",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
        { value: "both", label: "Both" },
      ],
      description:
        "Horizontal mirrors left and right; Vertical top and bottom.",
    },
    keep: {
      kind: "choice",
      label: "Keep",
      default: "first",
      options: [
        { value: "first", label: "Left / Top" },
        { value: "second", label: "Right / Bottom" },
      ],
      description: "Which half is drawn on both sides.",
    },
  },
  fragment: `
float fold(float t, bool keep_first) {
  return keep_first ? min(t, 1.0 - t) : max(t, 1.0 - t);
}

vec4 filter_image(vec2 uv) {
  bool first = u_keep == 0;
  vec2 p = uv;
  // The top is uv.y near 1, so keeping the top keeps the larger y.
  if (u_axis != 1) p.x = fold(uv.x, first);
  if (u_axis != 0) p.y = fold(uv.y, !first);
  return sample_input(p);
}`,
});
