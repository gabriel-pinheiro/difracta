import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** The golden angle: consecutive petals never line up. */
const TURN = 2.399963;
/** Where a petal's own angle is counted from; wrapped so it stays exact. */
const ORDERS = 1024;

interface Petal {
  /** Its place in the rosette, so every petal points somewhere new. */
  readonly order: number;
  /** A share of the reach Size asks for. */
  readonly reach: number;
  /** Seconds since it was added. */
  age: number;
}

export const petalBuild = defineVisual({
  id: "petal-build",
  name: "Petal Build",
  description:
    "Add Petal unfolds another luminous petal into an accumulating rosette; Release clears it.",
  notes:
    "A build-and-drop Visual for two Cues: fire Add Petal on every hit through a phrase and the rosette fills out, then Release on the drop and the Surface goes dark at once. Each petal unfolds from the middle over Entry Duration, easing open, and then stays; the whole rosette turns slowly at Speed, which integrates, so changing it live is smooth and never jumps. Petals caps the rosette; a petal beyond it retires the oldest, and each petal keeps the angle it was given, so the figure never re-shuffles. Size scales how far the petals reach against the shorter side, with a little variation per petal. Automatic Rate adds petals on its own, jittered around the mean, so the rosette builds without Cues; leave it at zero for a purely played instrument. Costs nothing while empty and one filled-and-stroked curve per petal per frame otherwise, which is cheap even at the cap. Additive blend mode makes the overlaps glow where petals cross.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 0, 0.251, 1] },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.15,
      min: 0,
      max: 2,
      step: 0.05,
      unit: "x",
    },
    petals: {
      kind: "number",
      label: "Petals",
      default: 12,
      min: 1,
      max: 24,
      step: 1,
    },
    entryDuration: {
      kind: "number",
      label: "Entry Duration",
      default: 1600,
      min: 100,
      max: 6000,
      step: 100,
      unit: "ms",
    },
    size: {
      kind: "number",
      label: "Size",
      default: 0.75,
      min: 0.1,
      max: 1,
      step: 0.05,
      percent: true,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [
    { key: "addPetal", label: "Add Petal" },
    { key: "release", label: "Release" },
  ],
  create({ random, params: initial }) {
    const petals: Petal[] = [];
    const timer = rateTimer(random);
    let params = initial;
    let next = 0;
    let motion = 0;
    const addPetal = (): void => {
      petals.push({ order: next, reach: 0.28 + random() * 0.18, age: 0 });
      next = (next + 1) % ORDERS;
      while (petals.length > Math.round(params.petals)) petals.shift();
    };
    return {
      cue(key) {
        if (key === "release") petals.length = 0;
        else addPetal();
      },
      update(frame) {
        params = frame.params;
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          addPetal();
        while (petals.length > Math.round(params.petals)) petals.shift();
        motion = (motion + frame.dt * params.speed) % (Math.PI * 8);
        const entry = params.entryDuration / 1000;
        let unfolding = false;
        for (const petal of petals) {
          if (petal.age < entry) unfolding = true;
          petal.age += frame.dt;
        }
        return {
          blank: petals.length === 0,
          changed: frame.changed || unfolding || params.speed > 0,
        };
      },
      render({ context, width, height, params: p }) {
        const scale = Math.min(width, height);
        const entry = p.entryDuration / 1000;
        context.globalCompositeOperation = "lighter";
        context.lineWidth = Math.max(1, scale * 0.003);
        for (const petal of petals) {
          const growth =
            entry <= 0 ? 1 : Math.max(0, Math.min(1, petal.age / entry));
          const eased = growth * growth * (3 - 2 * growth);
          const length = scale * p.size * petal.reach * eased;
          context.save();
          context.translate(width / 2, height / 2);
          context.rotate(petal.order * TURN + motion * 0.25);
          context.strokeStyle = cssColor(p.color, eased * 0.75 * p.color[3]);
          context.fillStyle = cssColor(p.color, eased * 0.05 * p.color[3]);
          context.beginPath();
          context.moveTo(0, 0);
          context.bezierCurveTo(
            length * 0.25,
            -length * 0.45,
            length * 0.85,
            -length * 0.3,
            length,
            0,
          );
          context.bezierCurveTo(
            length * 0.85,
            length * 0.3,
            length * 0.25,
            length * 0.45,
            0,
            0,
          );
          context.fill();
          context.stroke();
          context.restore();
        }
      },
    };
  },
});
