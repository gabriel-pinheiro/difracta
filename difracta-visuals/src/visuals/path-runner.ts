import type { VisualDefinition } from "@difracta/core";

export const pathRunner: VisualDefinition = {
  kind: "visual",
  id: "path-runner",
  name: "Path Runner",
  description:
    "A bright streak that runs along a Path, such as the edge of a ceiling or the frame of a door. A Launch Cue sends another one.",
  backend: "canvas",
  parameters: {
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0.1,
      max: 5,
      step: 0.05,
    },
    length: {
      kind: "number",
      label: "Trail length",
      default: 20,
      min: 1,
      max: 100,
      step: 1,
      unit: "%",
    },
    color: { kind: "color", label: "Color", default: [0.4, 0.9, 1, 1] },
    bounce: {
      kind: "boolean",
      label: "Bounce at the ends",
      description: "Off runs the Path as a loop, on turns around at each end.",
      default: false,
    },
  },
  guides: [
    {
      key: "track",
      kind: "path",
      label: "Track",
      description: "The Path the streak follows.",
    },
  ],
  cues: [{ key: "launch", label: "Launch", description: "Sends a streak." }],
};
