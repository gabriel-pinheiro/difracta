import { defineFilter } from "@difracta/render/sdk";

const side = (label: string, where: string) =>
  ({
    kind: "number",
    label: `Crop ${label}`,
    default: 0,
    min: 0,
    max: 1,
    step: 0.005,
    percent: true,
    description: `How much of the picture is cut from the ${where}.`,
  }) as const;

export const crop = defineFilter({
  id: "crop",
  name: "Crop",
  description:
    "Cuts a strip from each side of the picture; what is cut goes transparent and the rest stays where it is.",
  notes:
    "Four straight cuts, one per side, each a fraction of the picture's width or height: the strip goes transparent and what is left stays exactly where it was, so cropping never moves or scales the clip. Use it to take a letterbox off a clip, to keep one band of a Visual, or to stop a clip short of a Surface's edge where a Mask would be too much. Cuts that meet leave nothing, which is a wipe when Crop Left is swept from a Number Controller or a Macro; crop one side to just past the subject and the clip reveals from the other. The edge is one pixel soft, so it does not shimmer when a cut lands between pixels. At all four at zero the pass is skipped. Nothing is animated: it redraws only when a Parameter changes, and a still picture under it costs nothing after the first frame. It belongs inside a Visual Layer, where the cuts are in the clip's own space and follow the Surface's mapping, so Crop Top cuts the top of the clip on a skewed wall too; at the root it cuts the projector's frame itself. For a window that moves or scales rather than a cut, stack Transform under it, so the crop stays put while the clip moves behind it; the Live Visual has crops of its own that happen before its Fit, which this one cannot replace.",
  parameters: {
    left: side("Left", "left"),
    top: side("Top", "top"),
    right: side("Right", "right"),
    bottom: side("Bottom", "bottom"),
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  // The top is uv.y near 1.
  vec2 low = vec2(u_left, u_bottom);
  vec2 high = vec2(1.0 - u_right, 1.0 - u_top);
  vec2 inside = smoothstep(low - u_texel, low, uv) * (1.0 - smoothstep(high, high + u_texel, uv));
  return sample_input(uv) * inside.x * inside.y;
}`,
  create() {
    return {
      update({ params, changed }) {
        return {
          changed,
          identity:
            params.left <= 0 &&
            params.top <= 0 &&
            params.right <= 0 &&
            params.bottom <= 0,
        };
      },
    };
  },
});
