import {
  cssColor,
  defineVisual,
  fit,
  type PathGeometry,
  type Random,
} from "@difracta/render/sdk";
import type { Point } from "@difracta/core";

/** One bulb's own twinkle, so no two on the cable pulse together. */
interface Bulb {
  readonly phase: number;
  readonly rate: number;
}

function makeBulb(random: Random): Bulb {
  return { phase: random() * Math.PI * 2, rate: random.between(0.8, 2.2) };
}

/** Where the bulbs hang: evenly spaced along the Path, wrapping only if it closes. */
function anchors(path: PathGeometry, count: number): Point[] {
  const divisor = path.closed ? count : Math.max(1, count - 1);
  const list: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const sample = path.at(index / divisor);
    list.push({ x: sample.x, y: sample.y });
  }
  return list;
}

export const frameGarland = defineVisual({
  id: "frame-garland",
  name: "Frame Garland",
  description:
    "A Path becomes a sagging cable of alternating bulbs, each twinkling on its own.",
  notes:
    "Party lights strung along the Path: Bulbs bulbs of Bulb Size pixels alternate between the two colours on a cable of Cable Color that droops between them by Sag, a share of each span, always downward on the Surface however the Path runs. Each bulb carries a halo of Glow Reach times its size and a small white highlight, so Bulb Size and Glow Reach together decide whether it reads as a string of points or a wash of colour; a high Glow Reach with many bulbs fills the area beside the cable. Twinkle Speed is how fast the bulbs breathe, each at its own rate around it, and it integrates, so changing it live never jumps; at zero the string holds still and the Layer costs nothing to redraw. On an open Path the first bulb sits on the first point and the last on the last, with no cable closing the gap between them; on a closed Path the bulbs are spaced right round and the cable closes. It draws one radial gradient per bulb, which is the cost, so a hundred and twenty bulbs is real work on a weak Output while a few dozen is nothing. Over a dark Scene it is a finished look on its own; stack Frame Electric under it if you want the cable to crackle.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Bulb Color A",
      default: [1, 0.376, 0.376, 1],
    },
    colorB: {
      kind: "color",
      label: "Bulb Color B",
      default: [0.376, 1, 0.588, 1],
    },
    cable: {
      kind: "color",
      label: "Cable Color",
      default: [0.118, 0.133, 0.173, 1],
    },
    bulbs: {
      kind: "number",
      label: "Bulbs",
      default: 36,
      min: 6,
      max: 120,
      step: 2,
    },
    size: {
      kind: "number",
      label: "Bulb Size",
      default: 5,
      min: 2,
      max: 24,
      step: 0.5,
      unit: "px",
    },
    sag: {
      kind: "number",
      label: "Sag",
      default: 0.18,
      min: 0,
      max: 0.6,
      step: 0.01,
      percent: true,
      description:
        "How far the cable droops between bulbs, as a share of the span.",
    },
    glowReach: {
      kind: "number",
      label: "Glow Reach",
      default: 3.2,
      min: 1,
      max: 8,
      step: 0.1,
      unit: "x",
      description: "The halo around each bulb, as a multiple of Bulb Size.",
    },
    twinkle: {
      kind: "number",
      label: "Twinkle Speed",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
      unit: "/s",
    },
  },
  paths: [{ key: "frame", label: "Frame" }],
  create({ random, params: initial, paths: initialPaths }) {
    const bulbs: Bulb[] = [];
    let time = 0;
    let cable = anchors(initialPaths.frame, Math.round(initial.bulbs));
    let closed = initialPaths.frame.closed;
    fit(bulbs, initial.bulbs, () => makeBulb(random));
    return {
      update(frame) {
        // The Path geometry only moves when the frame reports a change, so the
        // anchors are walked then and reused otherwise.
        if (frame.changed) {
          cable = anchors(frame.paths.frame, Math.round(frame.params.bulbs));
          closed = frame.paths.frame.closed;
          fit(bulbs, frame.params.bulbs, () => makeBulb(random));
        }
        time += frame.dt * frame.params.twinkle;
        const { colorA, colorB, cable: wire } = frame.params;
        return {
          blank: colorA[3] <= 0 && colorB[3] <= 0 && wire[3] <= 0,
          changed: frame.changed || frame.params.twinkle > 0,
        };
      },
      render({ context, params: p }) {
        context.globalCompositeOperation = "source-over";
        context.lineCap = "round";
        context.lineJoin = "round";
        const spans = closed ? cable.length : cable.length - 1;
        context.strokeStyle = cssColor(p.cable);
        context.lineWidth = Math.max(1, p.size * 0.22);
        context.beginPath();
        for (let index = 0; index < spans; index += 1) {
          const start = cable[index];
          const end = cable[(index + 1) % cable.length];
          if (start === undefined || end === undefined) continue;
          const droop = Math.hypot(end.x - start.x, end.y - start.y) * p.sag;
          context.moveTo(start.x, start.y);
          context.quadraticCurveTo(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2 + droop,
            end.x,
            end.y,
          );
        }
        context.stroke();
        const reach = p.size * p.glowReach;
        cable.forEach((anchor, index) => {
          const bulb = bulbs[index];
          if (bulb === undefined) return;
          const color = index % 2 === 0 ? p.colorA : p.colorB;
          const level =
            0.35 +
            0.65 *
              Math.pow(
                0.5 + 0.5 * Math.sin(time * bulb.rate + bulb.phase),
                1.6,
              );
          const glow = context.createRadialGradient(
            anchor.x,
            anchor.y,
            0,
            anchor.x,
            anchor.y,
            reach,
          );
          glow.addColorStop(0, cssColor(color, 0.55 * level * color[3]));
          glow.addColorStop(1, cssColor(color, 0));
          context.fillStyle = glow;
          context.beginPath();
          context.arc(anchor.x, anchor.y, reach, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.arc(anchor.x, anchor.y, p.size, 0, Math.PI * 2);
          context.fillStyle = cssColor(color, (0.4 + 0.6 * level) * color[3]);
          context.fill();
          context.beginPath();
          context.arc(
            anchor.x - p.size * 0.3,
            anchor.y - p.size * 0.3,
            p.size * 0.25,
            0,
            Math.PI * 2,
          );
          context.fillStyle = cssColor([1, 1, 1, 1], 0.5 * level * color[3]);
          context.fill();
        });
      },
    };
  },
});
