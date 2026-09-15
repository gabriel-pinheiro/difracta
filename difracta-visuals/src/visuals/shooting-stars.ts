import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
  type Random,
} from "@difracta/render/sdk";
import type { Color } from "@difracta/core";

const TURN = Math.PI * 2;
/** Sparks past this in one star are dropped, whatever Sparks says. */
const MAX_SPARKS = 400;
/** Unit randoms kept per tail spark. */
const TAIL_STRIDE = 9;
/** Sparks orbiting the head; how many are drawn follows Sparks. */
const HEAD_SPARKS = 32;
const HEAD_STRIDE = 4;

interface Star {
  /** Seconds since the Cue. */
  age: number;
  /** Which way it flies, as a unit vector. */
  readonly directionX: number;
  readonly directionY: number;
  /** Where it enters, as a share of the Surface. */
  readonly startX: number;
  readonly startY: number;
  /** Where in Size Variation this star's head sits, from -1 to 1. */
  readonly sizeAt: number;
  /** `TAIL_STRIDE` unit randoms per tail spark, fixed at the Cue. */
  readonly tail: Float32Array;
  /** `HEAD_STRIDE` unit randoms per head spark. */
  readonly head: Float32Array;
}

function fill(random: Random, length: number): Float32Array {
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) values[index] = random();
  return values;
}

function makeStar(random: Random, sparkCount: number): Star {
  const sign = random() < 0.5 ? -1 : 1;
  const angle = 0.22 + random() * 0.34;
  return {
    age: 0,
    directionX: sign * Math.cos(angle),
    directionY: Math.sin(angle),
    startX: sign > 0 ? -0.12 + random() * 0.46 : 0.66 + random() * 0.46,
    startY: -0.08 + random() * 0.36,
    sizeAt: random() * 2 - 1,
    tail: fill(random, sparkCount * TAIL_STRIDE),
    head: fill(random, HEAD_SPARKS * HEAD_STRIDE),
  };
}

function drawSpark(
  context: CanvasRenderingContext2D,
  color: Color,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  context.beginPath();
  context.arc(x, y, Math.max(0.2, radius * 2.8), 0, TURN);
  context.fillStyle = cssColor(color, alpha * 0.12 * color[3]);
  context.fill();
  context.beginPath();
  context.arc(x, y, Math.max(0.08, radius), 0, TURN);
  context.fillStyle = cssColor(color, alpha * color[3]);
  context.fill();
}

export const shootingStars = defineVisual({
  id: "shooting-stars",
  name: "Shooting Stars",
  description:
    "Every Shoot sends a bright star across the Surface, shedding a long sparkling tail behind it.",
  notes:
    "A night-sky Visual: fire Shoot and a star enters from off one edge at a shallow angle, crosses in Flight Duration, and sheds Sparks behind it as it goes. Each spark lingers for Trail Persistence, drifting backward at Spark Speed, fanning by Spark Spread and sagging a little, while it twinkles and fades, so the tail is what you actually see and the two Trail and Spark Parameters are what shape it. Size is the head's width in pixels and Size Variation is how much that varies from star to star, so a low variation gives a uniform sky and a high one a mix of near and far. Spark Size scales every spark against the head. The path and every spark's luck are fixed when the star is cued, so a live Parameter change shapes the next star and never re-shuffles one in flight. Automatic Rate shoots on its own, jittered around the mean, which is how this reads as a background; leave it at zero for a purely played instrument. This is the most expensive Visual in the catalog: Sparks circles are drawn per star per frame, so several stars at the default 360 is thousands of fills a frame. Halve Sparks before anything else on a slow Output. Additive blend mode over a dark Scene.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    flightDuration: {
      kind: "number",
      label: "Flight Duration",
      default: 7.6,
      min: 0.5,
      max: 30,
      step: 0.1,
      unit: "s",
      description: "How long a star takes to cross the Surface.",
    },
    size: {
      kind: "number",
      label: "Size",
      default: 2.25,
      min: 0.25,
      max: 14,
      step: 0.05,
      unit: "px",
    },
    sizeVariation: {
      kind: "number",
      label: "Size Variation",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How much the head's width varies from star to star.",
    },
    trailPersistence: {
      kind: "number",
      label: "Trail Persistence",
      default: 3.6,
      min: 0.2,
      max: 5,
      step: 0.1,
      unit: "s",
    },
    sparks: {
      kind: "number",
      label: "Sparks",
      default: 360,
      min: 20,
      max: 400,
      step: 10,
    },
    sparkSize: {
      kind: "number",
      label: "Spark Size",
      default: 1,
      min: 0.1,
      max: 2.5,
      step: 0.05,
      unit: "x",
    },
    sparkSpeed: {
      kind: "number",
      label: "Spark Speed",
      default: 42,
      min: 0,
      max: 150,
      step: 2,
    },
    sparkSpread: {
      kind: "number",
      label: "Spark Spread",
      default: 26,
      min: 0,
      max: 120,
      step: 2,
    },
    automaticRate: automaticRate({ default: 0.4, max: 4 }),
  },
  cues: [{ key: "shoot", label: "Shoot" }],
  create({ random, params: initial }) {
    const stars: Star[] = [];
    const timer = rateTimer(random);
    let params = initial;
    const shoot = (): void => {
      stars.push(
        makeStar(random, Math.min(MAX_SPARKS, Math.round(params.sparks))),
      );
    };
    return {
      cue() {
        shoot();
      },
      update(frame) {
        params = frame.params;
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          shoot();
        const lifetime = params.flightDuration + params.trailPersistence;
        for (let index = stars.length - 1; index >= 0; index -= 1) {
          const live = stars[index];
          if (live === undefined) continue;
          live.age += frame.dt;
          if (live.age >= lifetime) stars.splice(index, 1);
        }
        return { blank: stars.length === 0, changed: stars.length > 0 };
      },
      render({ context, width, height, params: p }) {
        const flight = p.flightDuration;
        const travel = Math.max(width, height) * 1.35;
        const headCount = Math.round(
          Math.max(10, Math.min(HEAD_SPARKS, p.sparks / 8)),
        );
        context.globalCompositeOperation = "lighter";
        for (const star of stars) {
          const normalX = -star.directionY;
          const normalY = star.directionX;
          const startX = star.startX * width;
          const startY = star.startY * height;
          const headSize = p.size * (1 + star.sizeAt * p.sizeVariation);
          const count = star.tail.length / TAIL_STRIDE;
          for (let index = 0; index < count; index += 1) {
            const at = index * TAIL_STRIDE;
            const emission =
              (index + (star.tail[at] ?? 0) * 0.88) / Math.max(1, count);
            const sparkAge = star.age - emission * flight;
            if (sparkAge < 0 || sparkAge > p.trailPersistence) continue;
            const decay = 1 - sparkAge / p.trailPersistence;
            const twinkle =
              0.58 +
              0.42 *
                Math.sin(
                  sparkAge * (8 + (star.tail[at + 2] ?? 0) * 14) +
                    (star.tail[at + 1] ?? 0) * TURN,
                );
            const backward =
              p.sparkSpeed * (0.45 + (star.tail[at + 3] ?? 0) * 0.75);
            const sideways =
              ((star.tail[at + 4] ?? 0) - 0.5) * p.sparkSpread * 2;
            const sag = 3 + (star.tail[at + 5] ?? 0) * 10;
            const offset = ((star.tail[at + 6] ?? 0) - 0.5) * headSize * 1.6;
            const alongX = startX + star.directionX * travel * emission;
            const alongY = startY + star.directionY * travel * emission;
            const alpha =
              Math.pow(decay, 1.35) *
              Math.min(1, sparkAge / 0.045) *
              twinkle *
              (0.45 + (star.tail[at + 8] ?? 0) * 0.55) *
              0.82;
            if (alpha <= 0.002) continue;
            drawSpark(
              context,
              p.color,
              alongX +
                normalX * offset +
                (normalX * sideways - star.directionX * backward) * sparkAge,
              alongY +
                normalY * offset +
                (normalY * sideways - star.directionY * backward) * sparkAge +
                sag * sparkAge * sparkAge,
              p.sparkSize *
                (0.22 + (star.tail[at + 7] ?? 0) * 0.98) *
                (0.45 + decay * 0.55),
              Math.min(1, alpha),
            );
          }
          if (star.age > flight) continue;
          const headX = startX + star.directionX * travel * (star.age / flight);
          const headY = startY + star.directionY * travel * (star.age / flight);
          for (let index = 0; index < headCount; index += 1) {
            const at = index * HEAD_STRIDE;
            const orbit = (star.head[at] ?? 0) * TURN;
            const distance =
              Math.sqrt(star.head[at + 1] ?? 0) * headSize * 0.72;
            drawSpark(
              context,
              p.color,
              headX + Math.cos(orbit) * distance,
              headY + Math.sin(orbit) * distance,
              p.sparkSize * (0.45 + (star.head[at + 2] ?? 0) * 1.15),
              0.72 +
                0.28 *
                  Math.sin(star.age * 24 + (star.head[at + 3] ?? 0) * TURN),
            );
          }
        }
      },
    };
  },
});
