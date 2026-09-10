import type { FilterDefinition } from "@difracta/core";

export const blur: FilterDefinition = {
  kind: "filter",
  id: "blur",
  name: "Blur",
  description:
    "Softens everything below it. Small radii take the digital edge off, large ones turn a Scene into washes of light.",
  backend: "shader",
  recommended: true,
  parameters: {
    radius: {
      kind: "number",
      label: "Radius",
      default: 6,
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
    },
  },
};
