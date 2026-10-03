import { defineFilter } from "@difracta/render/sdk";

export const transform = defineFilter({
  id: "transform",
  name: "Transform",
  description:
    "Moves, scales, turns and flips the picture about its centre; what leaves the picture's edge is gone and what enters is transparent.",
  notes:
    "The nudge: Offset X and Offset Y slide the picture by a fraction of its width and height (positive is right and up), Scale grows or shrinks it about its centre, Rotation turns it in degrees, anticlockwise for positive, and Flip Horizontal and Flip Vertical reflect it. The picture is placed as a whole, so what moves past the edge is cut and the ground it leaves behind is transparent, showing whatever lies under the Layer; the edge is one pixel soft. Rotation and Scale are true to the picture's shape, measured from its size on the Output, so a turned clip is not sheared on a wide Surface. At the neutral values, no offset, Scale 1, no rotation, no flip, the pass is skipped. Nothing is animated by itself: it redraws when a Parameter changes, and linking Rotation to a Number Controller with anchors spanning the range spins the clip for the cost of one pass per frame. It belongs inside a Visual Layer, where it moves one clip on its own wall and follows the Surface's mapping, so Offset X slides the clip along the wall however the projector sees it; it is how a clip is placed without a Region when a Region's straight rectangle will not do, and a flip is how a clip plays mirrored for a second Surface facing the first. At the root it moves the whole projector frame, which shifts every Surface off its wall; that is rarely wanted. Stack Crop over it to keep a fixed window while the clip moves behind it, or Mirror and Kaleido over it to choose which part of the clip feeds the fold.",
  parameters: {
    offsetX: {
      kind: "number",
      label: "Offset X",
      default: 0,
      min: -1,
      max: 1,
      step: 0.005,
      description:
        "Slides the picture by a fraction of its width; positive is right.",
    },
    offsetY: {
      kind: "number",
      label: "Offset Y",
      default: 0,
      min: -1,
      max: 1,
      step: 0.005,
      description:
        "Slides the picture by a fraction of its height; positive is up.",
    },
    scale: {
      kind: "number",
      label: "Scale",
      default: 1,
      min: 0.1,
      max: 4,
      step: 0.01,
      description: "Grows or shrinks the picture about its centre.",
    },
    rotation: {
      kind: "number",
      label: "Rotation",
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: "°",
      description:
        "Turns the picture about its centre; positive is anticlockwise.",
    },
    flipHorizontal: {
      kind: "boolean",
      label: "Flip Horizontal",
      default: false,
      description: "Reflect left and right.",
    },
    flipVertical: {
      kind: "boolean",
      label: "Flip Vertical",
      default: false,
      description: "Reflect top and bottom.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec2 shape = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5 - vec2(u_offsetX, u_offsetY)) * shape;
  float turn = -radians(u_rotation);
  p = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * p;
  p = p / u_scale / shape + 0.5;
  if (u_flipHorizontal) p.x = 1.0 - p.x;
  if (u_flipVertical) p.y = 1.0 - p.y;
  vec2 inside = smoothstep(-u_texel, vec2(0.0), p) * (1.0 - smoothstep(vec2(1.0), 1.0 + u_texel, p));
  return sample_input(p) * inside.x * inside.y;
}`,
  create() {
    return {
      update({ params, changed }) {
        return {
          changed,
          identity:
            params.offsetX === 0 &&
            params.offsetY === 0 &&
            params.scale === 1 &&
            params.rotation === 0 &&
            !params.flipHorizontal &&
            !params.flipVertical,
        };
      },
    };
  },
});
