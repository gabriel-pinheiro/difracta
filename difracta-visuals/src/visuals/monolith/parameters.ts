import type { ParameterSchema } from "@difracta/core";
import { renderResolution, type ParameterValuesOf } from "@difracta/render/sdk";

const share = (label: string, value: number, description: string) =>
  ({
    kind: "number",
    label,
    default: value,
    min: 0,
    max: 1,
    step: 0.01,
    percent: true,
    description,
  }) as const;

export const monolithParameters = {
  energy: share(
    "Energy",
    0.5,
    "The performance fader: separation, torsion, light and motion within the current section.",
  ),
  coreColor: {
    kind: "color",
    label: "Core Color",
    default: [0.28, 0.78, 1, 1],
  },
  rimColorA: {
    kind: "color",
    label: "Rim Color A",
    default: [0.62, 0.78, 1, 1],
  },
  rimColorB: {
    kind: "color",
    label: "Rim Color B",
    default: [0.5, 0.18, 1, 1],
  },
  separation: share(
    "Separation",
    0.65,
    "How far the slabs spread; Build and Breakdown still close the assembly.",
  ),
  torsion: share(
    "Torsion",
    0.6,
    "How far neighbouring slabs turn against each other.",
  ),
  glow: share(
    "Glow",
    0.55,
    "Light escaping the core into the surrounding darkness.",
  ),
  motionSpeed: {
    kind: "number",
    label: "Motion Speed",
    default: 1,
    min: 0,
    max: 3,
    step: 0.05,
    unit: "x",
    description:
      "Continuous sculpture and light motion; zero holds it still while Cues remain playable.",
  },
  buildDuration: {
    kind: "number",
    label: "Build Duration",
    default: 8,
    min: 1,
    max: 32,
    step: 0.5,
    unit: "s",
    description:
      "Time for Build to seal and charge; it holds there until another section Cue.",
  },
  cameraDistance: {
    kind: "number",
    label: "Camera Distance",
    default: 11,
    min: 6,
    max: 14,
    step: 0.1,
    description:
      "Framing distance; narrow Surfaces automatically pull back to retain the assembly.",
  },
  shake: share(
    "Shake",
    0.35,
    "Camera movement on Kick and Drop; zero keeps the view steady.",
  ),
  quality: {
    kind: "choice",
    label: "Quality",
    default: "medium",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
    description: "Bevel precision and, at High, shadows between slabs.",
  },
  renderResolution: renderResolution({ default: 0.65 }),
} as const satisfies ParameterSchema;

export type MonolithValues = ParameterValuesOf<typeof monolithParameters>;

export const MONOLITH_CUES = [
  {
    key: "kick",
    label: "Kick",
    description:
      "Sends a compression and light wave through the slabs; repeated hits overlap.",
  },
  {
    key: "strobe",
    label: "Strobe",
    description: "A short white hit from the core and rim lights.",
  },
  {
    key: "flash",
    label: "Flash",
    description: "Alias of Strobe, for mappings shared with Liquid Chrome.",
  },
  {
    key: "build",
    label: "Build",
    description:
      "Aligns and seals the slabs around a charging slit, then holds.",
  },
  {
    key: "drop",
    label: "Drop",
    description:
      "Tears the assembly open with a flash and keeps it moving in an expanded arrangement.",
  },
  {
    key: "breakdown",
    label: "Breakdown",
    description: "Closes to a dark silhouette with one slow travelling light.",
  },
  {
    key: "calm",
    label: "Calm",
    description: "Returns to the breathing, partly open resting show.",
  },
  {
    key: "reconfigure",
    label: "Reconfigure",
    description:
      "Blends between Helix, Orbit and Fan arrangements without interrupting the section.",
  },
] as const;
