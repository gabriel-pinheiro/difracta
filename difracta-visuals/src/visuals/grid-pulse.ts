import type { VisualDefinition } from "@difracta/core";

export const gridPulse: VisualDefinition = {
  kind: "visual",
  id: "grid-pulse",
  name: "Grid Pulse",
  description:
    "Cells of a grid light up in waves. A Pulse Cue starts a wave from the center, so it locks to a beat from a controller.",
  backend: "shader",
  parameters: {
    columns: {
      kind: "number",
      label: "Columns",
      default: 12,
      min: 1,
      max: 64,
      step: 1,
    },
    rows: {
      kind: "number",
      label: "Rows",
      default: 8,
      min: 1,
      max: 64,
      step: 1,
    },
    glow: {
      kind: "number",
      label: "Glow",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
    invert: {
      kind: "boolean",
      label: "Invert",
      description: "Lit cells go dark and dark cells light up.",
      default: false,
    },
    color: { kind: "color", label: "Color", default: [1, 0.3, 0.5, 1] },
  },
  cues: [
    { key: "pulse", label: "Pulse", description: "A wave from the center." },
  ],
};
