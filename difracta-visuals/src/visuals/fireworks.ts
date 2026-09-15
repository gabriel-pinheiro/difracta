import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
  type Random,
} from "@difracta/render/sdk";
import type { Color } from "@difracta/core";

/** How long one launch stays visible, in seconds. */
const LIFETIME = 1.4;
/** Sparks past this in one launch are dropped, whatever Particles says. */
const MAX_SPARKS = 80;

interface Spark {
  /** Radians around the burst, jittered off the even spoke. */
  readonly angle: number;
  /** A share of the burst's radius. */
  readonly velocity: number;
  /** Phase of the glitter, so sparks do not twinkle together. */
  readonly phase: number;
}

interface Burst {
  /** Where it detonates, as a share of the Surface. */
  readonly x: number;
  readonly y: number;
  /** A share of the radius Burst Size asks for. */
  readonly spread: number;
  /** 0 is Spark Color A, 1 is Spark Color B. */
  readonly mix: number;
  readonly sparks: readonly Spark[];
}

interface Launch {
  /** Seconds since the Cue. */
  age: number;
  readonly bursts: readonly Burst[];
}

// Ease-out for the spread: fast at detonation, coasting afterwards.
function expansion(progress: number): number {
  return 1 - Math.exp(-2.8 * progress);
}

function mixColor(a: Color, b: Color, t: number): Color {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function makeBurst(random: Random, sparkCount: number): Burst {
  const sparks: Spark[] = [];
  for (let index = 0; index < sparkCount; index += 1)
    sparks.push({
      angle: (index / sparkCount) * Math.PI * 2 + (random() - 0.5) * 0.6,
      velocity: 0.7 + random() * 0.6,
      phase: random() * Math.PI * 2,
    });
  return {
    x: 0.2 + random() * 0.6,
    y: 0.12 + random() * 0.35,
    spread: 0.8 + random() * 0.4,
    mix: random(),
    sparks,
  };
}

export const fireworks = defineVisual({
  id: "fireworks",
  name: "Fireworks",
  description:
    "Every Launch detonates willow bursts whose glittering sparks expand, droop and fade.",
  notes:
    "A celebration Visual for the top of a Surface: fire Launch and Bursts per Launch shells go off in the upper third, each throwing Particles outward and letting them fall over about a second and a half. Burst Size scales how far the sparks reach, against the shorter side; Trail Length is how much of each spark's recent path is drawn behind it, which is what makes the willow. The geometry of a launch is fixed when it goes off, so changing Particles or Bursts per Launch shapes the next one and never re-shuffles one in the air. Automatic Rate launches on its own, jittered around the mean, which is how this reads as a background; leave it at zero for a purely played instrument. Cost is Bursts per Launch times Particles strokes per frame per launch in flight, so a high Particles with several launches overlapping is the expensive case: keep Particles under about fifty on a slow Output. Additive blend mode over a night Scene makes the sparks bloom.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Spark Color A",
      default: [1, 0.784, 0.431, 1],
    },
    colorB: {
      kind: "color",
      label: "Spark Color B",
      default: [1, 0.925, 0.784, 1],
    },
    bursts: {
      kind: "number",
      label: "Bursts per Launch",
      default: 2,
      min: 1,
      max: 5,
      step: 1,
    },
    particles: {
      kind: "number",
      label: "Particles",
      default: 36,
      min: 10,
      max: 80,
      step: 2,
    },
    size: {
      kind: "number",
      label: "Burst Size",
      default: 1,
      min: 0.3,
      max: 2,
      step: 0.05,
      percent: true,
    },
    trail: {
      kind: "number",
      label: "Trail Length",
      default: 0.6,
      min: 0.1,
      max: 1.5,
      step: 0.05,
      percent: true,
    },
    automaticRate: automaticRate(),
  },
  cues: [{ key: "launch", label: "Launch" }],
  create({ random, params: initial }) {
    const launches: Launch[] = [];
    const timer = rateTimer(random);
    let params = initial;
    let time = 0;
    const launch = (): void => {
      const sparkCount = Math.min(MAX_SPARKS, Math.round(params.particles));
      const bursts: Burst[] = [];
      for (let burst = 0; burst < Math.round(params.bursts); burst += 1)
        bursts.push(makeBurst(random, sparkCount));
      launches.push({ age: 0, bursts });
    };
    return {
      cue() {
        launch();
      },
      update(frame) {
        params = frame.params;
        // Wrapped, so the glitter phase keeps its precision however long it runs.
        time = (time + frame.dt) % 1000;
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          launch();
        for (let index = launches.length - 1; index >= 0; index -= 1) {
          const live = launches[index];
          if (live === undefined) continue;
          live.age += frame.dt;
          if (live.age >= LIFETIME) launches.splice(index, 1);
        }
        return { blank: launches.length === 0, changed: launches.length > 0 };
      },
      render({ context, width, height, params: p }) {
        const shorter = Math.min(width, height);
        const gravity = height * 0.5;
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";
        context.lineWidth = 1.2;
        for (const { bursts, age } of launches) {
          const progress = age / LIFETIME;
          const fade = Math.pow(1 - progress, 1.5);
          const headSpread = expansion(progress);
          for (const burst of bursts) {
            const centerX = burst.x * width;
            const centerY = burst.y * height;
            const radius = shorter * 0.3 * p.size * burst.spread;
            const color = mixColor(p.colorA, p.colorB, burst.mix);
            const trailSpan = 0.18 * p.trail;
            for (const spark of burst.sparks) {
              const velocity = radius * spark.velocity;
              const directionX = Math.cos(spark.angle) * velocity;
              const directionY = Math.sin(spark.angle) * 0.92 * velocity;
              context.beginPath();
              for (let step = 0; step <= 5; step += 1) {
                const at = Math.max(0, progress - trailSpan * (1 - step / 5));
                const spread = expansion(at);
                const x = centerX + directionX * spread;
                const y = centerY + directionY * spread + gravity * at * at;
                if (step === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
              }
              context.strokeStyle = cssColor(color, 0.5 * fade * color[3]);
              context.stroke();
              const glitter = Math.sin(time * 26 + spark.phase) > 0.35;
              context.beginPath();
              context.arc(
                centerX + directionX * headSpread,
                centerY +
                  directionY * headSpread +
                  gravity * progress * progress,
                glitter ? 1.9 : 1.1,
                0,
                Math.PI * 2,
              );
              context.fillStyle = glitter
                ? cssColor([1, 1, 1, 1], fade)
                : cssColor(color, 0.8 * fade * color[3]);
              context.fill();
            }
          }
        }
      },
    };
  },
});
