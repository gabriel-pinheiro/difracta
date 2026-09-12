import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
  type PathGeometry,
  type Random,
} from "@difracta/render/sdk";
import type { Color, Point } from "@difracta/core";

interface Bolt {
  readonly main: readonly Point[];
  /** Where along the main bolt each branch leaves, and its points. */
  readonly branches: readonly {
    readonly at: number;
    readonly points: readonly Point[];
  }[];
  readonly origin: Point;
  /** Phase of the flicker, so bolts of one strike do not pulse together. */
  readonly flicker: number;
}

interface Strike {
  readonly bolts: readonly Bolt[];
  /** Seconds since it struck. */
  age: number;
}

/** How long a strike stays visible, in seconds. */
const LIFETIME = 0.55;
const GROWTH = 0.12;
const ATTACK = 0.02;

function rotate(direction: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  };
}

/** A line from `start` along `direction` that wanders sideways, most in its middle. */
function jagged(
  start: Point,
  direction: Point,
  distance: number,
  jaggedness: number,
  segments: number,
  random: Random,
): readonly Point[] {
  const across = { x: -direction.y, y: direction.x };
  const points: Point[] = [];
  let wander = 0;
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    wander = wander * 0.45 + (random() * 2 - 1) * 0.55;
    const lateral =
      wander *
      distance *
      (0.02 + jaggedness * 0.1) *
      Math.sin(Math.PI * progress);
    points.push({
      x: start.x + direction.x * distance * progress + across.x * lateral,
      y: start.y + direction.y * distance * progress + across.y * lateral,
    });
  }
  return points;
}

function makeBolt(
  path: PathGeometry,
  random: Random,
  params: {
    readonly side: "outward" | "inward" | "both";
    readonly branching: number;
    readonly reach: number;
  },
  minDimension: number,
): Bolt {
  const sample = path.at(random());
  const side =
    params.side === "both"
      ? random() < 0.5
        ? "outward"
        : "inward"
      : params.side;
  const direction = rotate(path.side(sample, side), (random() * 2 - 1) * 0.5);
  const distance = minDimension * (params.reach / 100) * (0.7 + random() * 0.5);
  const main = jagged(sample, direction, distance, 0.6, 26, random);
  const branches: { readonly at: number; readonly points: readonly Point[] }[] =
    [];
  for (let branch = 0; branch < Math.round(params.branching * 5); branch += 1) {
    const at = 0.22 + random() * 0.5;
    const anchor =
      main[Math.min(main.length - 1, Math.floor(at * (main.length - 1)))];
    if (anchor === undefined) continue;
    const turned = rotate(direction, random.sign() * (0.35 + random() * 0.6));
    branches.push({
      at,
      points: jagged(
        anchor,
        turned,
        distance * (0.18 + (1 - at) * 0.35),
        0.75,
        10,
        random,
      ),
    });
  }
  return {
    main,
    branches,
    origin: { x: sample.x, y: sample.y },
    flicker: random() * Math.PI * 2,
  };
}

function trace(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
): void {
  const [first, ...rest] = points;
  if (first === undefined) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of rest) context.lineTo(point.x, point.y);
}

function strokeBolt(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  core: Color,
  glow: Color,
  width: number,
  alpha: number,
): void {
  trace(context, points);
  context.lineWidth = width * 6;
  context.strokeStyle = cssColor(glow, alpha * 0.07 * glow[3]);
  context.shadowBlur = width * 9;
  context.shadowColor = cssColor(glow, alpha * 0.7 * glow[3]);
  context.stroke();
  trace(context, points);
  context.lineWidth = width * 2.4;
  context.strokeStyle = cssColor(glow, alpha * 0.3 * glow[3]);
  context.shadowBlur = width * 4;
  context.stroke();
  trace(context, points);
  context.lineWidth = Math.max(0.5, width);
  context.strokeStyle = cssColor(core, alpha * core[3]);
  context.shadowBlur = width * 1.5;
  context.shadowColor = cssColor(core, alpha * core[3]);
  context.stroke();
}

export const lightningStrikes = defineVisual({
  id: "lightning-strikes",
  name: "Lightning Strikes",
  description:
    "Branching bolts erupt from a Path on a Cue or on their own, flare for half a second, and fade.",
  notes:
    "An impact Visual for a frame: bind the Path around the Surface's edge and fire Strike on hits, or let Automatic Rate strike by itself. Each strike shoots Bolts per Strike from random places on the Path, each Reach percent of the shorter side long, in the direction Emission Side says: Outward and Inward are judged against the Path's centre, so a frame drawn either way round emits the same way, and Both picks per bolt. Branching adds up to five side branches per bolt. A bolt grows over its first tenth of a second, stutters, and decays over about half a second; nothing is retimed by a Parameter change, since the geometry is fixed when the bolt strikes. Width is the core line in pixels; the glow around it is about six times wider, drawn with canvas shadows, which is the costly part. Costs nothing between strikes. Additive blend mode makes crossing bolts bloom.",
  parameters: {
    coreColor: {
      kind: "color",
      label: "Core Color",
      default: [0.95, 0.99, 1, 1],
    },
    glowColor: {
      kind: "color",
      label: "Glow Color",
      default: [0.27, 0.59, 1, 1],
    },
    side: {
      kind: "choice",
      label: "Emission Side",
      default: "outward",
      options: [
        { value: "outward", label: "Outward" },
        { value: "inward", label: "Inward" },
        { value: "both", label: "Both" },
      ],
    },
    branching: {
      kind: "number",
      label: "Branching",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    automaticRate: automaticRate({ default: 1.5, max: 6 }),
    boltsPerStrike: {
      kind: "number",
      label: "Bolts per Strike",
      default: 1,
      min: 1,
      max: 6,
      step: 1,
    },
    reach: {
      kind: "number",
      label: "Reach",
      default: 34,
      min: 5,
      max: 120,
      step: 1,
      unit: "%",
    },
    width: {
      kind: "number",
      label: "Width",
      default: 2.2,
      min: 0.4,
      max: 12,
      step: 0.1,
      unit: "px",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  cues: [{ key: "strike", label: "Strike" }],
  create({ random, params: initial, paths: initialPaths, width, height }) {
    const strikes: Strike[] = [];
    const timer = rateTimer(random);
    let params = initial;
    let paths = initialPaths;
    const minDimension = Math.min(width, height);
    const strike = (): void => {
      const bolts: Bolt[] = [];
      for (let bolt = 0; bolt < Math.round(params.boltsPerStrike); bolt += 1)
        bolts.push(makeBolt(paths.frame, random, params, minDimension));
      strikes.push({ bolts, age: 0 });
    };
    return {
      cue(key) {
        if (key === "strike") strike();
      },
      update(frame) {
        params = frame.params;
        paths = frame.paths;
        for (const live of strikes) live.age += frame.dt;
        while (strikes[0] !== undefined && strikes[0].age > LIFETIME)
          strikes.shift();
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          strike();
        return { blank: strikes.length === 0, changed: strikes.length > 0 };
      },
      render({ context, params: p }) {
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        context.lineJoin = "round";
        for (const { bolts, age } of strikes) {
          if (age > LIFETIME) continue;
          const growth = Math.min(1, age / GROWTH);
          const attack = Math.min(1, age / ATTACK);
          const decay = Math.pow(1 - age / LIFETIME, 1.6);
          for (const bolt of bolts) {
            const stutter = 0.72 + 0.28 * Math.sin(age * 90 + bolt.flicker);
            const envelope = attack * decay * stutter;
            const visible = Math.max(2, Math.ceil(growth * bolt.main.length));
            strokeBolt(
              context,
              bolt.main.slice(0, visible),
              p.coreColor,
              p.glowColor,
              p.width,
              envelope,
            );
            for (const branch of bolt.branches) {
              if (growth <= branch.at) continue;
              const branchGrowth = Math.min(1, (growth - branch.at) / 0.3);
              strokeBolt(
                context,
                branch.points.slice(
                  0,
                  Math.max(2, Math.ceil(branchGrowth * branch.points.length)),
                ),
                p.coreColor,
                p.glowColor,
                p.width * 0.5,
                envelope * 0.55,
              );
            }
            const radius = p.width * (8 + envelope * 12);
            const flash = context.createRadialGradient(
              bolt.origin.x,
              bolt.origin.y,
              0,
              bolt.origin.x,
              bolt.origin.y,
              radius,
            );
            flash.addColorStop(0, cssColor(p.coreColor, envelope * 0.8));
            flash.addColorStop(0.3, cssColor(p.glowColor, envelope * 0.3));
            flash.addColorStop(1, cssColor(p.glowColor, 0));
            context.shadowBlur = 0;
            context.fillStyle = flash;
            context.fillRect(
              bolt.origin.x - radius,
              bolt.origin.y - radius,
              radius * 2,
              radius * 2,
            );
          }
        }
        context.shadowBlur = 0;
      },
    };
  },
});
