import type { ParameterSchema } from "@difracta/core";
import {
  automaticRate,
  renderResolution,
  type ParameterValuesOf,
} from "@difracta/render/sdk";

/** The forms, dispatched on their index in the fragment; keep the order. */
export const FORM_OPTIONS = [
  { value: "mercury", label: "Mercury Cluster" },
  { value: "torus", label: "Torus" },
  { value: "urchin", label: "Urchin" },
  { value: "gyroid", label: "Gyroid Orb" },
  { value: "twisted-ring", label: "Twisted Ring" },
] as const;

export const FORM_ORDER_OPTIONS = [
  { value: "sequence", label: "Sequence" },
  { value: "random", label: "Random" },
] as const;

/** Dispatched on their index in the fragment; keep the order. */
export const QUALITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

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

export const liquidChromeParameters = {
  metalColor: {
    kind: "color",
    label: "Metal Color",
    default: [0.93, 0.95, 1, 1],
  },
  lightColorA: {
    kind: "color",
    label: "Light Color A",
    default: [1, 0.16, 0.6, 1],
  },
  lightColorB: {
    kind: "color",
    label: "Light Color B",
    default: [0.08, 0.72, 1, 1],
  },
  background: {
    kind: "color",
    label: "Background",
    default: [0.006, 0.004, 0.018, 1],
  },
  form: {
    kind: "choice",
    label: "Form",
    default: "mercury",
    options: FORM_OPTIONS,
    description: "The form it starts on; choosing another morphs to it.",
  },
  formOrder: {
    kind: "choice",
    label: "Form Order",
    default: "sequence",
    options: FORM_ORDER_OPTIONS,
  },
  energy: share(
    "Energy",
    0.4,
    "The fader: how hard the metal wobbles, turns and swells on a Kick.",
  ),
  rotationSpeed: {
    kind: "number",
    label: "Rotation Speed",
    default: 0.04,
    min: -0.5,
    max: 0.5,
    step: 0.01,
    unit: "turns/s",
  },
  morphDuration: {
    kind: "number",
    label: "Morph Duration",
    default: 1800,
    min: 100,
    max: 8000,
    step: 50,
    unit: "ms",
  },
  automaticRate: automaticRate({
    default: 0,
    max: 1,
    step: 0.01,
    description: "Morphs per second on its own; zero morphs only on a Cue.",
  }),
  viscosity: share(
    "Viscosity",
    0.5,
    "How far apart parts reach for each other and pool, like mercury.",
  ),
  spikiness: share(
    "Spikiness",
    0.5,
    "How long the Urchin's spikes are and how far a Kick throws spikes out.",
  ),
  iridescence: share(
    "Iridescence",
    0.35,
    "Oil-slick colour running over the metal.",
  ),
  glow: share(
    "Glow",
    0.5,
    "The halo of light around the sculpture and the pool it casts below.",
  ),
  cameraDistance: {
    kind: "number",
    label: "Camera Distance",
    default: 4.2,
    min: 2.6,
    max: 8,
    step: 0.1,
  },
  shake: share("Shake", 0.5, "How hard hits knock the camera."),
  quality: {
    kind: "choice",
    label: "Quality",
    default: "medium",
    options: QUALITY_OPTIONS,
    description:
      "March depth, shading and reflections; the cost control besides Resolution.",
  },
  renderResolution: renderResolution({ default: 0.6 }),
} as const satisfies ParameterSchema;

export type LiquidChromeValues = ParameterValuesOf<
  typeof liquidChromeParameters
>;
