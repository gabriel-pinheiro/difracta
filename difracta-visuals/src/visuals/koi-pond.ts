import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

/** One sine term of a koi's wander: a rate in the swim clock and a phase. */
interface Wave {
  readonly rate: number;
  readonly phase: number;
}

interface Patch {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

interface Koi {
  readonly slow: readonly [Wave, Wave];
  readonly fast: readonly [Wave, Wave];
  readonly lengthScale: number;
  readonly patches: readonly Patch[];
  /** Body flex, advanced with the swim clock and a little on its own. */
  wiggle: number;
}

function wave(random: Random, base: number, spread: number): Wave {
  return {
    rate: base + random() * spread,
    phase: random() * Math.PI * 2,
  };
}

function makeKoi(random: Random): Koi {
  const patches: Patch[] = [];
  for (let patch = 0; patch < 3; patch += 1) {
    if (random() < 0.35) continue;
    patches.push({
      x: 0.45 - random() * 0.8,
      y: random() - 0.5,
      angle: random() * Math.PI,
    });
  }
  return {
    slow: [wave(random, 0.09, 0.08), wave(random, 0.11, 0.08)],
    fast: [wave(random, 0.31, 0.14), wave(random, 0.27, 0.14)],
    lengthScale: 0.8 + random() * 0.4,
    patches,
    wiggle: random() * Math.PI * 2,
  };
}

/**
 * Two incommensurate sines per axis give a meandering path that never
 * repeats, evaluated at the koi's own swim clock rather than at wall time.
 */
function position(
  koi: Koi,
  swim: number,
  width: number,
  height: number,
): readonly [number, number] {
  const along = (slow: Wave, fast: Wave): number =>
    0.5 +
    0.38 * Math.sin(swim * slow.rate + slow.phase) +
    0.07 * Math.sin(swim * fast.rate + fast.phase);
  return [
    width * along(koi.slow[0], koi.fast[0]),
    height * along(koi.slow[1], koi.fast[1]),
  ];
}

export const koiPond = defineVisual({
  id: "koi-pond",
  name: "Koi Pond",
  description:
    "Stylized koi meander along smooth paths, each with its own patches. Swim Speed changes take effect mid-stroke without a jump.",
  notes:
    "Calm, figurative, and readable from far away: a few large fish on a dark Surface reads as a pond, many small ones as a school. The background is transparent, so put a Solid Color or a darker Visual below it. Fish Size is in Layer pixels and sets both the body and the wake of the tail; on a small or distant Surface keep it above 20 or the patches vanish. Swim Speed scales every fish's pace together and can be swept live. Body Color with a low alpha turns the fish into ghosts, and the same Patch Color as the ground hides the patches. Each fish costs a few filled curves, so even the maximum count is cheap.",
  parameters: {
    body: { kind: "color", label: "Body Color", default: [1, 0.957, 0.922, 1] },
    patch: {
      kind: "color",
      label: "Patch Color",
      default: [1, 0.431, 0.157, 1],
    },
    count: {
      kind: "number",
      label: "Fish",
      default: 7,
      min: 1,
      max: 20,
      step: 1,
    },
    size: {
      kind: "number",
      label: "Fish Size",
      default: 26,
      min: 8,
      max: 80,
      step: 1,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Swim Speed",
      default: 1,
      min: 0.1,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  create({ random, params }) {
    const fish: Koi[] = [];
    fit(fish, params.count, () => makeKoi(random));
    let swim = 0;
    return {
      update({ dt, params }) {
        fit(fish, params.count, () => makeKoi(random));
        const stroke = dt * params.speed;
        swim += stroke;
        for (const koi of fish) koi.wiggle += dt * 4 + stroke * 3;
      },
      render({ context, width, height, params }) {
        for (const koi of fish) {
          const [x, y] = position(koi, swim, width, height);
          const [aheadX, aheadY] = position(koi, swim + 0.06, width, height);
          const heading = Math.atan2(aheadY - y, aheadX - x);
          const pace = Math.hypot(aheadX - x, aheadY - y);
          const length = params.size * koi.lengthScale;
          const half = length * 0.32;
          const wiggle =
            Math.sin(koi.wiggle) * Math.min(1, pace / length + 0.3);

          context.save();
          context.translate(x, y);
          context.rotate(heading);

          // Tail fan, swishing opposite the body flex.
          context.beginPath();
          context.moveTo(-length * 0.45, 0);
          context.quadraticCurveTo(
            -length * 0.85,
            half * (0.9 * wiggle - 0.5),
            -length * (1.05 + 0.08 * wiggle),
            half * wiggle * 1.4,
          );
          context.quadraticCurveTo(
            -length * 0.85,
            half * (0.9 * wiggle + 0.5),
            -length * 0.45,
            0,
          );
          context.fillStyle = cssColor(params.body, 0.75 * params.body[3]);
          context.fill();

          // Teardrop body, nose forward.
          context.beginPath();
          context.moveTo(length * 0.6, 0);
          context.quadraticCurveTo(
            length * 0.35,
            -half,
            -length * 0.2,
            -half * (0.55 - 0.2 * wiggle),
          );
          context.quadraticCurveTo(
            -length * 0.55,
            half * 0.12 * wiggle,
            -length * 0.2,
            half * (0.55 + 0.2 * wiggle),
          );
          context.quadraticCurveTo(length * 0.35, half, length * 0.6, 0);
          context.closePath();
          context.fillStyle = cssColor(params.body);
          context.fill();

          // Patches, clipped to the body outline.
          context.clip();
          context.fillStyle = cssColor(params.patch, 0.9 * params.patch[3]);
          for (const patch of koi.patches) {
            context.beginPath();
            context.ellipse(
              length * patch.x,
              half * patch.y,
              length * 0.2,
              half * 0.55,
              patch.angle,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
          context.restore();
        }
      },
    };
  },
});
