import { defineShaderVisual } from "@difracta/render/sdk";

import {
  BEAM,
  GOBOS,
  PRISMS,
  TRAVEL_FIGURES,
} from "./moving-head-spot-shader.ts";

const TAU = Math.PI * 2;
/** The shutter is open for this share of every strobe cycle. */
const STROBE_OPEN = 0.35;
/** How far the gobo swings either way while shaking. */
const SHAKE_RADIANS = (12 * Math.PI) / 180;

/** Options are dispatched on their index in the fragment; keep the order. */
export const FIGURES = [
  { value: "orbit", label: "Orbit" },
  { value: "infinity", label: "Infinity" },
  { value: "horizontal-sweep", label: "Horizontal Sweep" },
  { value: "vertical-sweep", label: "Vertical Sweep" },
  { value: "diagonal-sweep", label: "Diagonal Sweep" },
  { value: "diamond", label: "Diamond" },
  { value: "rounded-rectangle", label: "Rounded Rectangle" },
  { value: "triangle", label: "Triangle" },
  { value: "clover", label: "Clover" },
  { value: "spiral", label: "Spiral" },
  { value: "wander", label: "Wander" },
] as const;

export const GOBO_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "ring", label: "Ring" },
  { value: "dot-cluster", label: "Dot Cluster" },
  { value: "bars", label: "Bars" },
  { value: "star", label: "Star" },
  { value: "pinwheel", label: "Pinwheel" },
  { value: "spiral", label: "Spiral" },
  { value: "breakup", label: "Breakup" },
] as const;

export const PRISM_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "three-facet", label: "3-Facet" },
  { value: "five-facet-linear", label: "5-Facet Linear" },
  { value: "six-facet-circular", label: "6-Facet Circular" },
  { value: "six-facet-linear", label: "6-Facet Linear" },
  { value: "eight-facet-circular", label: "8-Facet Circular" },
] as const;

const turns = (label: string) =>
  ({
    kind: "number",
    label,
    default: 0,
    min: -2,
    max: 2,
    step: 0.05,
    unit: "turns/s",
  }) as const;

const degrees = (label: string) =>
  ({
    kind: "number",
    label,
    default: 0,
    min: 0,
    max: 360,
    step: 1,
    unit: "°",
  }) as const;

export const movingHeadSpot = defineShaderVisual({
  id: "moving-head-spot",
  name: "Moving Head Spot",
  description:
    "A moving-head fixture: a beam travels a figure across the Surface, with a spinning gobo, a prism that multiplies it, and a strobe shutter.",
  notes:
    "The stage light of the Catalog. Figure is the shape the beam travels, Speed how many figures per second, negative to run it backwards; Phase offsets several heads on one Speed so they fan out, and the Bump Cue restarts the figure, so a Macro can snap every head to a beat. Zoom is the beam diameter as a share of the shorter side and Focus its edge, soft at zero and razor-sharp at one. With Keep Visible on, the figure shrinks so the whole footprint stays inside the Surface, prism spread included. A Gobo stencils the beam; Gobo Angle turns it, Gobo Spin keeps it turning and Gobo Shake wobbles it at a rate in hertz. A Prism splits the beam into facets, Prism Spread apart, along a line or a circle, and Prism Spin rotates the arrangement. Strobe Rate shutters the beam, open about a third of each cycle; zero keeps it open and the Layer disappears while shut, so it costs nothing then. Every motion integrates, so any rate can be swept live without a jump, and a head with nothing moving costs nothing. Additive blend mode over a Scene lights it rather than covering it. Costs one full-Surface pass per frame while anything moves, up to eight gobo evaluations per pixel with the widest prism.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    figure: {
      kind: "choice",
      label: "Figure",
      default: "orbit",
      options: FIGURES,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.1,
      min: -2,
      max: 2,
      step: 0.05,
      unit: "figures/s",
    },
    phase: {
      kind: "number",
      label: "Phase",
      default: 0,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "Where along the figure this head is relative to another.",
    },
    keepVisible: {
      kind: "boolean",
      label: "Keep Visible",
      default: true,
      description:
        "Shrink the figure so the whole beam, prism included, stays inside the Surface.",
    },
    zoom: {
      kind: "number",
      label: "Zoom",
      default: 0.15,
      min: 0.02,
      max: 0.5,
      step: 0.01,
      description: "Beam diameter as a share of the Surface's shorter side.",
    },
    focus: {
      kind: "number",
      label: "Focus",
      default: 0.85,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    gobo: {
      kind: "choice",
      label: "Gobo",
      default: "open",
      options: GOBO_OPTIONS,
    },
    goboAngle: degrees("Gobo Angle"),
    goboSpin: turns("Gobo Spin"),
    goboShake: {
      kind: "number",
      label: "Gobo Shake",
      default: 0,
      min: 0,
      max: 12,
      step: 0.5,
      unit: "Hz",
    },
    prism: {
      kind: "choice",
      label: "Prism",
      default: "off",
      options: PRISM_OPTIONS,
    },
    prismSpread: {
      kind: "number",
      label: "Prism Spread",
      default: 0.1,
      min: 0,
      max: 0.4,
      step: 0.01,
      description: "Facet distance as a share of the Surface's shorter side.",
    },
    prismAngle: degrees("Prism Angle"),
    prismSpin: turns("Prism Spin"),
    strobeRate: {
      kind: "number",
      label: "Strobe Rate",
      default: 0,
      min: 0,
      max: 20,
      step: 0.5,
      unit: "Hz",
    },
  },
  cues: [
    {
      key: "bump",
      label: "Bump",
      description: "Restart the figure from its beginning.",
    },
  ],
  fragment: `${TRAVEL_FIGURES}\n${GOBOS}\n${PRISMS}\n${BEAM}`,
  create() {
    let progress = 0;
    let goboTurns = 0;
    let prismTurns = 0;
    let shake = 0;
    let strobe = 0;
    let wasOpen: boolean | undefined;
    return {
      cue() {
        progress = 0;
      },
      update({ dt, params, changed }) {
        progress = (progress + dt * params.speed) % 1;
        goboTurns = (goboTurns + dt * params.goboSpin) % 1;
        prismTurns = (prismTurns + dt * params.prismSpin) % 1;
        shake = (shake + dt * params.goboShake) % 1;
        strobe = (strobe + dt * params.strobeRate) % 1;
        const open = params.strobeRate <= 0 || strobe < STROBE_OPEN;
        const flipped = open !== wasOpen;
        wasOpen = open;
        const moving =
          params.speed !== 0 ||
          params.goboSpin !== 0 ||
          params.prismSpin !== 0 ||
          params.goboShake > 0;
        const wobble =
          params.goboShake > 0 ? SHAKE_RADIANS * Math.sin(shake * TAU) : 0;
        return {
          changed: changed || flipped || (open && moving),
          blank: !open || params.color[3] <= 0,
          uniforms: {
            progress: progress + params.phase,
            gobo_turn:
              (params.goboAngle * Math.PI) / 180 + goboTurns * TAU + wobble,
            prism_turn: (params.prismAngle * Math.PI) / 180 + prismTurns * TAU,
          },
        };
      },
    };
  },
});
