import {
  cssColor,
  defineVisual,
  smooth,
  type Random,
} from "@difracta/render/sdk";
import type { Point } from "@difracta/core";

interface Line {
  readonly horizontal: boolean;
  /** Where on the two edges it starts and ends, 0 to 1. */
  readonly from: number;
  readonly to: number;
  /** Which way it bows. */
  readonly bend: 1 | -1;
  /** Where along the span the bow peaks, 0.35 to 0.65. */
  readonly peak: number;
  /** Phase of its vibration, so lines never swing together. */
  readonly phase: number;
  /** Seconds since it was added. */
  age: number;
}

/** How fast the vibration amplitude follows its Parameter, per second. */
const VIBRATION_RESPONSE = 12.5;
const SAMPLES = 40;

function makeLine(random: Random, orientation: string): Line {
  return {
    horizontal:
      orientation === "horizontal" ||
      (orientation === "mixed" && random() < 0.5),
    from: random(),
    to: random(),
    bend: random.sign(),
    peak: 0.35 + random() * 0.3,
    phase: random() * Math.PI * 2,
    age: 0,
  };
}

function quadratic(start: Point, control: Point, end: Point, t: number): Point {
  const s = 1 - t;
  return {
    x: s * s * start.x + 2 * s * t * control.x + t * t * end.x,
    y: s * s * start.y + 2 * s * t * control.y + t * t * end.y,
  };
}

export const tensionLines = defineVisual({
  id: "tension-lines",
  name: "Tension Lines",
  description:
    "Add Line strings another bowed, humming line across the Target into a growing set; Release lets them all go.",
  notes:
    "A build-and-drop Visual for two Cues, the string-section sibling of Beam Web: every Add Line hit adds a line from one edge to the opposite one, bowed to one side by Tension and trembling by Vibration at Speed, and Release clears them all at once. Orientation picks horizontal lines, vertical ones, or a mix chosen per line. Each line draws itself out over Entry Duration. Maximum Lines caps the set; a hit beyond it retires the oldest. Tension and Vibration are shares of the shorter side, so the look holds on any Surface; Vibration eases to a new value over about a tenth of a second rather than snapping, and Speed integrates, so both can be ridden live. Trigger Chance drops some Add Line hits at random. Width is the stroke in pixels and its glow is a canvas shadow, the costly part. Costs nothing while empty and one canvas draw per frame while lines tremble. Additive blend mode makes crossings bloom.",
  parameters: {
    color: {
      kind: "color",
      label: "Line Color",
      default: [1, 0.353, 0.824, 1],
    },
    orientation: {
      kind: "choice",
      label: "Orientation",
      default: "mixed",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
        { value: "mixed", label: "Mixed" },
      ],
    },
    maximumLines: {
      kind: "number",
      label: "Maximum Lines",
      default: 14,
      min: 1,
      max: 32,
      step: 1,
    },
    width: {
      kind: "number",
      label: "Width",
      default: 2,
      min: 0.5,
      max: 12,
      step: 0.5,
      unit: "px",
    },
    tension: {
      kind: "number",
      label: "Tension",
      default: 0.28,
      min: 0,
      max: 0.8,
      step: 0.02,
      description: "How far the bow reaches, as a share of the shorter side.",
    },
    vibration: {
      kind: "number",
      label: "Vibration",
      default: 0.01,
      min: 0,
      max: 0.06,
      step: 0.002,
      description: "How far the bow trembles, as a share of the shorter side.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.8,
      min: 0,
      max: 5,
      step: 0.1,
      unit: "x",
    },
    entryDuration: {
      kind: "number",
      label: "Entry Duration",
      default: 280,
      min: 0,
      max: 2000,
      step: 20,
      unit: "ms",
    },
    chance: {
      kind: "number",
      label: "Trigger Chance",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
  },
  cues: [
    { key: "addLine", label: "Add Line" },
    { key: "release", label: "Release" },
  ],
  create({ random, params: initial }) {
    const lines: Line[] = [];
    let params = initial;
    let time = 0;
    let vibration = initial.vibration;
    return {
      cue(key) {
        if (key === "release") lines.length = 0;
        else if (random() < params.chance) {
          lines.push(makeLine(random, params.orientation));
          while (lines.length > params.maximumLines) lines.shift();
        }
      },
      update(frame) {
        params = frame.params;
        while (lines.length > params.maximumLines) lines.shift();
        time += frame.dt * params.speed;
        const before = vibration;
        vibration = smooth(
          vibration,
          params.vibration,
          frame.dt,
          VIBRATION_RESPONSE,
        );
        if (Math.abs(vibration - params.vibration) < 0.00001)
          vibration = params.vibration;
        const entry = params.entryDuration / 1000;
        let entering = false;
        for (const line of lines) {
          if (line.age < entry) entering = true;
          line.age += frame.dt;
        }
        const trembling = params.speed > 0 && vibration > 0;
        return {
          blank: lines.length === 0,
          changed:
            frame.changed ||
            (lines.length > 0 &&
              (entering || trembling || vibration !== before)),
        };
      },
      render({ context, width, height, params: p }) {
        const shorter = Math.min(width, height);
        const entry = p.entryDuration / 1000;
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = cssColor(p.color, 0.9 * p.color[3]);
        context.lineWidth = p.width;
        context.shadowBlur = p.width * 5;
        context.shadowColor = cssColor(p.color, 0.85 * p.color[3]);
        for (const line of lines) {
          const start = line.horizontal
            ? { x: 0, y: line.from * height }
            : { x: line.from * width, y: 0 };
          const end = line.horizontal
            ? { x: width, y: line.to * height }
            : { x: line.to * width, y: height };
          const bow =
            line.bend * p.tension * shorter +
            Math.sin(time * 8 + line.phase) * vibration * shorter;
          const control = line.horizontal
            ? { x: width * line.peak, y: (start.y + end.y) / 2 + bow }
            : { x: (start.x + end.x) / 2 + bow, y: height * line.peak };
          const progress =
            entry <= 0 ? 1 : 1 - Math.pow(1 - Math.min(1, line.age / entry), 3);
          context.beginPath();
          for (let index = 0; index <= SAMPLES; index += 1) {
            const point = quadratic(
              start,
              control,
              end,
              (index / SAMPLES) * progress,
            );
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          }
          context.stroke();
        }
        context.shadowBlur = 0;
      },
    };
  },
});
