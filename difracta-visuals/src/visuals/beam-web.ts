import { cssColor, defineVisual, type Random } from "@difracta/render/sdk";
import type { Color } from "@difracta/core";

interface Beam {
  readonly startEdge: number;
  readonly startAt: number;
  readonly endEdge: number;
  readonly endAt: number;
  /** Phases of the drift sines, so each beam sways on its own. */
  readonly sway: readonly [number, number, number, number];
  /** 0 is Beam Color A, 1 is Beam Color B. */
  readonly mix: number;
  /** Seconds since it was added. */
  age: number;
}

function edgePoint(
  edge: number,
  at: number,
  width: number,
  height: number,
): readonly [number, number] {
  if (edge === 0) return [at * width, 0];
  if (edge === 1) return [width, at * height];
  if (edge === 2) return [(1 - at) * width, height];
  return [0, (1 - at) * height];
}

function makeBeam(random: Random): Beam {
  const startEdge = Math.floor(random() * 4);
  const across = random() < 0.55 ? 2 : 1;
  return {
    startEdge,
    startAt: random(),
    endEdge: (startEdge + across) % 4,
    endAt: random(),
    sway: [random(), random(), random(), random()].map(
      (value) => value * Math.PI * 2,
    ) as unknown as Beam["sway"],
    mix: random(),
    age: 0,
  };
}

function mixColor(a: Color, b: Color, t: number): Color {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

export const beamWeb = defineVisual({
  id: "beam-web",
  name: "Beam Web",
  description:
    "Add Beam lays another glowing line across the Target, edge to edge, into a slowly drifting web; Release clears them all.",
  notes:
    "A build-and-drop Visual for two Cues: fire Add Beam on every hit through a phrase and the web thickens, then Release on the drop and the Surface goes dark at once. Each beam enters over Entry Duration, from one edge toward the other, and then drifts by Motion at Speed, which integrates, so slowing it live is smooth. Maximum Beams caps the web; a new beam beyond it retires the oldest. Beam Color A and B are mixed at random per beam, so two close hues read as one material and two far ones as a mesh of light. Glow is the blur around each line and is the expensive part: on a slow Output lower it or keep Width small. Trigger Chance below 100% drops some Add Beam hits at random. Additive blend mode makes crossings bloom. Costs nothing while empty and one canvas draw per frame while beams drift.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Beam Color A",
      default: [0.27, 0.86, 1, 1],
    },
    colorB: {
      kind: "color",
      label: "Beam Color B",
      default: [1, 0.24, 0.82, 1],
    },
    maximumBeams: {
      kind: "number",
      label: "Maximum Beams",
      default: 16,
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
    glow: {
      kind: "number",
      label: "Glow",
      default: 0.8,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    motion: {
      kind: "number",
      label: "Motion",
      default: 0.08,
      min: 0,
      max: 0.35,
      step: 0.01,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.4,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    entryDuration: {
      kind: "number",
      label: "Entry Duration",
      default: 320,
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
    { key: "addBeam", label: "Add Beam" },
    { key: "release", label: "Release" },
  ],
  create({ random, params: initial }) {
    const beams: Beam[] = [];
    let params = initial;
    let time = 0;
    return {
      cue(key) {
        if (key === "release") beams.length = 0;
        else if (random() < params.chance) {
          beams.push(makeBeam(random));
          while (beams.length > params.maximumBeams) beams.shift();
        }
      },
      update(frame) {
        params = frame.params;
        while (beams.length > params.maximumBeams) beams.shift();
        time += frame.dt * params.speed;
        const entry = params.entryDuration / 1000;
        let entering = false;
        for (const beam of beams) {
          if (beam.age < entry) entering = true;
          beam.age += frame.dt;
        }
        return {
          blank: beams.length === 0,
          changed:
            frame.changed ||
            entering ||
            (params.speed > 0 && params.motion > 0),
        };
      },
      render({ context, width, height, params: p }) {
        const drift = p.motion * Math.min(width, height);
        const entry = p.entryDuration / 1000;
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        for (const beam of beams) {
          const [sx, sy] = edgePoint(
            beam.startEdge,
            beam.startAt,
            width,
            height,
          );
          const [ex, ey] = edgePoint(beam.endEdge, beam.endAt, width, height);
          const start = [
            sx + Math.sin(time * 1.7 + beam.sway[0]) * drift,
            sy + Math.cos(time * 1.3 + beam.sway[1]) * drift,
          ];
          const end = [
            ex + Math.cos(time * 1.1 + beam.sway[2]) * drift,
            ey + Math.sin(time * 1.9 + beam.sway[3]) * drift,
          ];
          const progress =
            entry <= 0 ? 1 : 1 - Math.pow(1 - Math.min(1, beam.age / entry), 3);
          const color = mixColor(p.colorA, p.colorB, beam.mix);
          context.beginPath();
          context.moveTo(start[0] ?? 0, start[1] ?? 0);
          context.lineTo(
            (start[0] ?? 0) + ((end[0] ?? 0) - (start[0] ?? 0)) * progress,
            (start[1] ?? 0) + ((end[1] ?? 0) - (start[1] ?? 0)) * progress,
          );
          context.strokeStyle = cssColor(color, 0.88 * color[3]);
          context.lineWidth = p.width;
          context.shadowBlur = p.width * 8 * p.glow;
          context.shadowColor = cssColor(color, 0.9 * color[3]);
          context.stroke();
        }
        context.shadowBlur = 0;
      },
    };
  },
});
