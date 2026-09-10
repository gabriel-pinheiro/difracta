import type { VisualDefinition } from "@difracta/core";

export const plasma: VisualDefinition = {
  kind: "visual",
  id: "plasma",
  name: "Plasma",
  description:
    "Slow bands of color folding into each other, the classic demo-scene plasma. Fills any shape with motion that never repeats.",
  backend: "shader",
  parameters: {
    scale: {
      kind: "number",
      label: "Scale",
      default: 2,
      min: 0.5,
      max: 8,
      step: 0.1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
    },
    palette: {
      kind: "choice",
      label: "Palette",
      default: "ember",
      options: [
        { value: "ember", label: "Ember" },
        { value: "ocean", label: "Ocean" },
        { value: "mono", label: "Monochrome" },
      ],
    },
    contrast: {
      kind: "number",
      label: "Contrast",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
    },
  },
};
