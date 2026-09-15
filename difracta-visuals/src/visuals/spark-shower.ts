import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
  type Random,
} from "@difracta/render/sdk";
import type { Color } from "@difracta/core";

/** Sparks past this in one shower are dropped, whatever Sparks says. */
const MAX_SPARKS = 120;
/** Unit randoms kept per spark: sideways, along, color mix, line width. */
const STRIDE = 4;

interface Shower {
  /** Seconds since the Cue. */
  age: number;
  /** Where the spray starts, as a share of the Surface's width. */
  readonly originX: number;
  /** `STRIDE` unit randoms per spark, fixed at the Cue. */
  readonly sparks: Float32Array;
}

function mixColor(a: Color, b: Color, t: number): Color {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function makeShower(random: Random, count: number): Shower {
  const sparks = new Float32Array(count * STRIDE);
  for (let index = 0; index < sparks.length; index += 1)
    sparks[index] = random();
  return { age: 0, originX: 0.2 + random() * 0.6, sparks };
}

export const sparkShower = defineVisual({
  id: "spark-shower",
  name: "Spark Shower",
  description:
    "Every Shower throws a spray of glowing two-color sparks across the Surface, falling or rising.",
  notes:
    "A pyro Visual for accents: fire Shower and Sparks streaks leave one point just off an edge, fanning out by Spread, travelling by Speed and bending back by Gravity over Lifetime. Upward flips the whole spray, starting it below the Surface and throwing it up, which is how it reads as a stage gerb rather than falling embers. Each spark is drawn as a short streak between where it was and where it is, so Speed also sets how long the streaks look. Spark Color A and B are mixed at random per spark, so a hot pair reads as one flame. Each shower's spray is fixed when it fires, so changing Sparks shapes the next one and never re-shuffles one in the air. Automatic Rate fires showers on its own for a texture; at zero it is purely played. Cost is Sparks strokes per frame per shower in flight. Additive blend mode over a dark Scene makes the crossings bloom; put two Layers on one Surface, one Upward and one not, for a full fountain.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Spark Color A",
      default: [1, 0.882, 0.471, 1],
    },
    colorB: {
      kind: "color",
      label: "Spark Color B",
      default: [1, 0.353, 0.157, 1],
    },
    upward: { kind: "boolean", label: "Upward", default: false },
    sparks: {
      kind: "number",
      label: "Sparks",
      default: 42,
      min: 8,
      max: 120,
      step: 2,
    },
    spread: {
      kind: "number",
      label: "Spread",
      default: 0.7,
      min: 0.1,
      max: 1.5,
      step: 0.05,
      percent: true,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0.2,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    gravity: {
      kind: "number",
      label: "Gravity",
      default: 1,
      min: 0,
      max: 3,
      step: 0.1,
      unit: "x",
    },
    lifetime: {
      kind: "number",
      label: "Lifetime",
      default: 1300,
      min: 200,
      max: 4000,
      step: 50,
      unit: "ms",
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "shower", label: "Shower" }],
  create({ random, params: initial }) {
    const showers: Shower[] = [];
    const timer = rateTimer(random);
    let params = initial;
    const shower = (): void => {
      showers.push(
        makeShower(random, Math.min(MAX_SPARKS, Math.round(params.sparks))),
      );
    };
    return {
      cue() {
        shower();
      },
      update(frame) {
        params = frame.params;
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          shower();
        const lifetime = params.lifetime / 1000;
        for (let index = showers.length - 1; index >= 0; index -= 1) {
          const live = showers[index];
          if (live === undefined) continue;
          live.age += frame.dt;
          if (live.age >= lifetime) showers.splice(index, 1);
        }
        return { blank: showers.length === 0, changed: showers.length > 0 };
      },
      render({ context, width, height, params: p }) {
        const sign = p.upward ? -1 : 1;
        const originY = sign > 0 ? -height * 0.04 : height * 1.04;
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        for (const live of showers) {
          const progress = live.age / (p.lifetime / 1000);
          if (progress < 0 || progress > 1) continue;
          const originX = live.originX * width;
          const fade = Math.pow(1 - progress, 1.3);
          const before = Math.max(0, progress - 0.04);
          for (let index = 0; index < live.sparks.length; index += STRIDE) {
            const across = ((live.sparks[index] ?? 0) - 0.5) * width * p.spread;
            const along =
              sign *
              height *
              p.speed *
              (0.45 + (live.sparks[index + 1] ?? 0) * 0.75);
            const pull = sign * height * p.gravity * 0.5;
            context.beginPath();
            context.moveTo(
              originX + across * before,
              originY + along * before + pull * before * before,
            );
            context.lineTo(
              originX + across * progress,
              originY + along * progress + pull * progress * progress,
            );
            const color = mixColor(
              p.colorA,
              p.colorB,
              live.sparks[index + 2] ?? 0,
            );
            context.strokeStyle = cssColor(color, fade * color[3]);
            context.lineWidth = 1 + (live.sparks[index + 3] ?? 0) * 2;
            context.stroke();
          }
        }
      },
    };
  },
});
