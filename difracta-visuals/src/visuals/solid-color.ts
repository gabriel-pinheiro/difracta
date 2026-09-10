import { cssColor, defineVisual } from "@difracta/render/sdk";

export const solidColor = defineVisual({
  id: "solid-color",
  name: "Solid Color",
  description:
    "One flat color over the whole Target. The plainest way to light a Surface, and a base for Filters above it.",
  recommended: true,
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 0.85, 0.6, 1] },
  },
  create: () => ({
    // Nothing moves: redraw only when the color does, and disappear at alpha 0.
    update: ({ changed, params }) => ({
      changed,
      blank: params.color[3] === 0,
    }),
    render({ context, width, height, params }) {
      context.fillStyle = cssColor(params.color);
      context.fillRect(0, 0, width, height);
    },
  }),
});
