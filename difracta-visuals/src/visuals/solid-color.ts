import type { VisualDefinition } from "@difracta/core";

export const solidColor: VisualDefinition = {
  kind: "visual",
  id: "solid-color",
  name: "Solid Color",
  description:
    "One flat color over the whole Target. The plainest way to light a Surface, and a base for Filters above it.",
  backend: "canvas",
  recommended: true,
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 0.85, 0.6, 1] },
  },
};
