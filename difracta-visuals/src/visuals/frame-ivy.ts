import {
  automaticRate,
  cssColor,
  defineVisual,
  fit,
  rateTimer,
  smooth,
  type PathGeometry,
  type Random,
} from "@difracta/render/sdk";

/** One leaf's own sway and shape, so no two on the vine move together. */
interface Leaf {
  readonly rate: number;
  readonly phase: number;
  readonly scale: number;
  readonly blossom: boolean;
  readonly shade: number;
}

/** A place on the vine: the Path point and the unit normal to wobble along. */
interface Node {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  /** Only for a leaf: the direction of travel there. */
  readonly angle: number;
}

/** How much of the Path one Growth Cue creeps over. */
const GROWTH_STEP = 0.125;
/** How fast the creep eases toward what the Cues have asked for, per second. */
const CREEP_RATE = 6;
/** How much of the Path a leaf takes to open once the creep reaches it. */
const OPENING = 0.06;

function makeLeaf(random: Random): Leaf {
  return {
    rate: random.between(0.7, 1.2),
    phase: random() * Math.PI * 2,
    scale: random.between(0.7, 1.3),
    blossom: random() > 0.88,
    shade: random.between(0.8, 1),
  };
}

function nodes(path: PathGeometry, count: number): Node[] {
  const divisor = path.closed ? count : Math.max(1, count - 1);
  const list: Node[] = [];
  for (let index = 0; index < count; index += 1) {
    const sample = path.at(index / divisor);
    const normal = path.side(sample, "a");
    list.push({
      x: sample.x,
      y: sample.y,
      nx: normal.x,
      ny: normal.y,
      angle: Math.atan2(sample.ty, sample.tx),
    });
  }
  return list;
}

export const frameIvy = defineVisual({
  id: "frame-ivy",
  name: "Frame Ivy",
  description:
    "A Path grows into a swaying vine of leaves and occasional blossoms, creeping in on a Cue.",
  notes:
    "A living border for the Path: a vine of Vine Color meanders along it with Leaves leaves of Leaf Size pixels, alternating sides, about one in eight opening as a blossom in Flower Color instead. Sway is how hard the whole thing breathes, each leaf turning at its own rate around it, and it integrates, so changing it live never jumps. The Growth Cue is what makes it a performance Visual: a fresh Layer is fully grown, and each Growth creeps the vine on by an eighth of the Path, so once it is full the next Growth strips it back to bare and it grows in again over the eight after that. Automatic Rate does the same on its own and is off by default; at zero, with Sway at zero and nothing growing, the Layer holds still and costs nothing to redraw. Leaves open over the last few percent of the Path the creep passes, so the edge of the growth is a row of half-opened leaves rather than a hard cut. On an open Path the vine starts on the first point and stops on the last without joining them, and the creep runs from the first point toward the last; on a closed Path it goes right round. It draws the vine as one polyline of twice Leaves points plus two curves per leaf, so a hundred and twenty leaves is real work on a weak Output. It is opaque and dark: give it a Solid Color or a lit Path Visual under it rather than stacking it over one.",
  parameters: {
    vine: {
      kind: "color",
      label: "Vine Color",
      default: [0.18, 0.345, 0.165, 1],
    },
    leaf: {
      kind: "color",
      label: "Leaf Color",
      default: [0.329, 0.627, 0.275, 1],
    },
    flower: {
      kind: "color",
      label: "Flower Color",
      default: [0.922, 0.667, 0.824, 1],
    },
    leaves: {
      kind: "number",
      label: "Leaves",
      default: 42,
      min: 8,
      max: 120,
      step: 2,
    },
    size: {
      kind: "number",
      label: "Leaf Size",
      default: 11,
      min: 4,
      max: 40,
      step: 0.5,
      unit: "px",
    },
    sway: {
      kind: "number",
      label: "Sway",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    automaticRate: automaticRate({ default: 0, max: 4, step: 0.05 }),
  },
  paths: [{ key: "frame", label: "Frame" }],
  cues: [{ key: "growth", label: "Growth" }],
  create({ random, params: initial, paths: initialPaths }) {
    const leaves: Leaf[] = [];
    const timer = rateTimer(random);
    let time = 0;
    let coverage = 1;
    let target = 1;
    let count = Math.round(initial.leaves);
    let stems = nodes(initialPaths.frame, count);
    let spine = nodes(initialPaths.frame, count * 2);
    let closed = initialPaths.frame.closed;
    fit(leaves, count, () => makeLeaf(random));
    const grow = (): void => {
      if (target >= 1) {
        // A full vine is stripped bare, and the Growth after this one starts
        // the creep again, so the loop reads as eight beats and a reset.
        target = 0;
        coverage = 0;
        return;
      }
      target = Math.min(1, target + GROWTH_STEP);
    };
    return {
      cue(key) {
        if (key === "growth") grow();
      },
      update(frame) {
        // The Path geometry only moves when the frame reports a change, so the
        // vine is walked then and reused otherwise.
        if (frame.changed) {
          count = Math.round(frame.params.leaves);
          stems = nodes(frame.paths.frame, count);
          spine = nodes(frame.paths.frame, count * 2);
          closed = frame.paths.frame.closed;
          fit(leaves, count, () => makeLeaf(random));
        }
        time += frame.dt * frame.params.sway;
        for (
          let fired = timer.advance(frame.dt, frame.params.automaticRate);
          fired > 0;
          fired -= 1
        )
          grow();
        coverage = smooth(coverage, target, frame.dt, CREEP_RATE);
        const creeping = Math.abs(coverage - target) > 0.001;
        if (!creeping) coverage = target;
        return {
          blank: coverage <= 0,
          changed: frame.changed || creeping || frame.params.sway > 0,
        };
      },
      render({ context, params: p }) {
        if (coverage <= 0) return;
        context.globalCompositeOperation = "source-over";
        context.lineCap = "round";
        context.lineJoin = "round";
        const drawn = Math.max(1, Math.round(coverage * spine.length));
        context.strokeStyle = cssColor(p.vine);
        context.lineWidth = Math.max(1, p.size * 0.18);
        context.beginPath();
        for (let step = 0; step < drawn; step += 1) {
          const node = spine[step];
          if (node === undefined) continue;
          const wobble = Math.sin(step * 1.7 + time * 0.6) * p.size * 0.35;
          const x = node.x + node.nx * wobble;
          const y = node.y + node.ny * wobble;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        if (closed && drawn >= spine.length) context.closePath();
        context.stroke();
        stems.forEach((stem, index) => {
          const leaf = leaves[index];
          if (leaf === undefined) return;
          const divisor = closed ? stems.length : Math.max(1, stems.length - 1);
          const progress = index / divisor;
          // The creep reaches a little past itself, so the leaf it has just
          // arrived at is open rather than a hair short of it.
          const opening = Math.min(
            1,
            (coverage * (1 + OPENING) - progress) / OPENING,
          );
          if (opening <= 0) return;
          const turn = Math.sin(time * leaf.rate + leaf.phase) * 0.22;
          const side = index % 2 === 0 ? 1 : -1;
          const size = p.size * leaf.scale * opening;
          context.save();
          context.translate(stem.x, stem.y);
          context.rotate(stem.angle + side * (Math.PI / 3) + turn);
          if (leaf.blossom) {
            for (let petal = 0; petal < 5; petal += 1) {
              const angle = (petal / 5) * Math.PI * 2;
              context.beginPath();
              context.ellipse(
                Math.cos(angle) * size * 0.35,
                Math.sin(angle) * size * 0.35,
                size * 0.32,
                size * 0.2,
                angle,
                0,
                Math.PI * 2,
              );
              context.fillStyle = cssColor(p.flower);
              context.fill();
            }
            context.beginPath();
            context.arc(0, 0, size * 0.18, 0, Math.PI * 2);
            context.fillStyle = cssColor([1, 0.922, 0.549, 1], p.flower[3]);
            context.fill();
          } else {
            // Pointed leaf: two mirrored quadratic curves plus a mid vein.
            context.beginPath();
            context.moveTo(0, 0);
            context.quadraticCurveTo(size * 0.55, -size * 0.45, size * 1.1, 0);
            context.quadraticCurveTo(size * 0.55, size * 0.45, 0, 0);
            context.fillStyle = cssColor(p.leaf, leaf.shade * p.leaf[3]);
            context.fill();
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(size * 1.05, 0);
            context.strokeStyle = cssColor(p.vine, 0.6 * p.vine[3]);
            context.lineWidth = Math.max(0.5, size * 0.06);
            context.stroke();
          }
          context.restore();
        });
      },
    };
  },
});
