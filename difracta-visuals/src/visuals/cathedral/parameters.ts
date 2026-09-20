import type { ParameterSchema } from "@difracta/core";
import { renderResolution } from "@difracta/render/sdk";

/** Options are dispatched on their index in the fragment; keep the order. */
export const ARCHITECTURES = [
  { value: "gothic", label: "Gothic" },
  { value: "brutalist", label: "Brutalist" },
] as const;

export const QUALITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const CATHEDRAL_CUES = [
  {
    key: "kick",
    label: "Kick",
    description: "Pulses the uplights on the pillars and steps their chase.",
  },
  {
    key: "strobe",
    label: "Strobe",
    description: "Fires the strobe bank: a white hit on stone and haze.",
  },
  {
    key: "build",
    label: "Build",
    description:
      "Beams converge, fog thickens and the camera slows until Drop.",
  },
  {
    key: "drop",
    label: "Drop",
    description: "Every fixture on, the camera surges and shakes, beams sweep.",
  },
  {
    key: "breakdown",
    label: "Breakdown",
    description: "Falls back to one slow beam over dimmed stone.",
  },
  {
    key: "calm",
    label: "Calm",
    description: "Returns to the resting show: slow sweeps, soft wash.",
  },
] as const;

const percent = (label: string, value: number, description?: string) =>
  ({
    kind: "number",
    label,
    default: value,
    min: 0,
    max: 1,
    step: 0.01,
    percent: true,
    ...(description === undefined ? {} : { description }),
  }) as const;

export const CATHEDRAL_PARAMETERS = {
  energy: percent(
    "Energy",
    0.6,
    "How hard the rig works: fixture speed and brightness. Made for a fader.",
  ),
  cameraSpeed: {
    kind: "number",
    label: "Camera Speed",
    default: 1,
    min: 0,
    max: 4,
    step: 0.05,
    unit: "x",
  },
  fogDensity: percent("Fog Density", 0.4),
  beams: {
    kind: "number",
    label: "Beams",
    default: 8,
    min: 0,
    max: 12,
    step: 1,
    description: "Moving heads hung down the nave, in pairs.",
  },
  lasers: percent("Lasers", 0.6, "How bright the laser fan is."),
  shake: percent("Shake", 0.5, "How hard kicks and drops jolt the camera."),
  buildDuration: {
    kind: "number",
    label: "Build Duration",
    default: 8,
    min: 1,
    max: 32,
    step: 0.5,
    unit: "s",
    description: "How long a Build takes to reach its peak.",
  },
  beamColorA: {
    kind: "color",
    label: "Beam Color A",
    default: [0.62, 0.85, 1, 1],
  },
  beamColorB: {
    kind: "color",
    label: "Beam Color B",
    default: [1, 0.3, 0.78, 1],
  },
  washColor: {
    kind: "color",
    label: "Wash Color",
    default: [0.42, 0.18, 1, 1],
  },
  laserColor: {
    kind: "color",
    label: "Laser Color",
    default: [0.25, 1, 0.45, 1],
  },
  stoneColor: {
    kind: "color",
    label: "Stone Color",
    default: [0.62, 0.64, 0.7, 1],
  },
  ambient: percent("Ambient", 0.35, "Light on the stone besides the rig."),
  architecture: {
    kind: "choice",
    label: "Architecture",
    default: "gothic",
    options: ARCHITECTURES,
  },
  quality: {
    kind: "choice",
    label: "Quality",
    default: "medium",
    options: QUALITIES,
    description: "March steps, occlusion and floor reflections.",
  },
  renderResolution: renderResolution({ default: 0.5 }),
} as const satisfies ParameterSchema;
