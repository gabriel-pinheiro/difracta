import type { FilterDefinition } from "@difracta/core";

export const hueShift: FilterDefinition = {
  kind: "filter",
  id: "hue-shift",
  name: "Hue Shift",
  description:
    "Rotates every color below it around the hue wheel and scales saturation. Recolors a whole Scene from one Controller.",
  backend: "shader",
  parameters: {
    hue: {
      kind: "number",
      label: "Hue",
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: "°",
    },
    saturation: {
      kind: "number",
      label: "Saturation",
      default: 1,
      min: 0,
      max: 2,
      step: 0.01,
    },
  },
};
