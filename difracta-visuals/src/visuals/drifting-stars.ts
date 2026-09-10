import type { VisualDefinition } from "@difracta/core";

export const driftingStars: VisualDefinition = {
  kind: "visual",
  id: "drifting-stars",
  name: "Drifting Stars",
  description:
    "A field of small points that slowly drift and twinkle. Quiet by itself, and a Twinkle Cue makes the whole field flare for a moment.",
  backend: "canvas",
  recommended: true,
  parameters: {
    count: {
      kind: "number",
      label: "Stars",
      default: 120,
      min: 1,
      max: 500,
      step: 1,
    },
    size: {
      kind: "number",
      label: "Size",
      default: 2,
      min: 0.5,
      max: 8,
      step: 0.5,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Drift",
      default: 0.4,
      min: 0,
      max: 3,
      step: 0.05,
    },
    color: { kind: "color", label: "Color", default: [0.9, 0.95, 1, 1] },
  },
  cues: [
    {
      key: "twinkle",
      label: "Twinkle",
      description: "Every star flares and settles back.",
    },
  ],
};
