import type { FilterDefinition } from "@difracta/core";

export const pixelate: FilterDefinition = {
  kind: "filter",
  id: "pixelate",
  name: "Pixelate",
  description:
    "Reduces everything below it to large square cells, each the average of what it covers.",
  backend: "shader",
  parameters: {
    size: {
      kind: "number",
      label: "Cell size",
      default: 16,
      min: 2,
      max: 128,
      step: 1,
      unit: "px",
    },
  },
};
