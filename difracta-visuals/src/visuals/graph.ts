import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

interface Node {
  /** Where it sits before its drift, 0 to 1 of the Target. */
  readonly x: number;
  readonly y: number;
  readonly phaseX: number;
  readonly phaseY: number;
}

/** How far a node wanders from its place, as a share of the Target. */
const WANDER = 0.035;

function makeNode(random: Random): Node {
  return {
    x: random(),
    y: random(),
    phaseX: random() * 8,
    phaseY: random() * 8,
  };
}

export const graph = defineVisual({
  id: "graph",
  name: "Graph",
  description:
    "Drifting nodes join into a network of bowed filaments wherever two of them come within Link Distance.",
  notes:
    "A network, a constellation or a swarm depending on how tight it is: drifting dots with a curved filament between any two that are close enough, each filament fading as it stretches. It draws its own filaments additively on transparency, so it wants a dark ground and reads best with Additive blend mode over another Layer. Nodes is how many dots are in play and Link Distance how close two must be before a filament appears, as a share of the Target's shorter side, so the look holds on any Surface: below about 10% only neighbours join and it reads as sparse dust, above 30% almost everything joins and it turns into a solid mesh. The two interact sharply, because links go as the square of Nodes: 90 nodes at 40% is the expensive corner, and the pair loop is what keeps this Visual on canvas. Drift Speed integrates, so it can be swept live and held at 0 for a still web that costs nothing after the first frame. Filament Color carries both the dots and the lines.",
  parameters: {
    color: {
      kind: "color",
      label: "Filament Color",
      default: [0.651, 1, 0.792, 1],
    },
    nodes: {
      kind: "number",
      label: "Nodes",
      default: 42,
      min: 12,
      max: 90,
      step: 1,
    },
    linkDistance: {
      kind: "number",
      label: "Link Distance",
      default: 0.18,
      min: 0.05,
      max: 0.4,
      step: 0.01,
      percent: true,
      description:
        "How close two nodes must be to join, as a share of the shorter side.",
    },
    speed: {
      kind: "number",
      label: "Drift Speed",
      default: 0.18,
      min: 0,
      max: 2,
      step: 0.02,
      unit: "x",
    },
  },
  create({ random, params }) {
    const all: Node[] = [];
    fit(all, params.nodes, () => makeNode(random));
    /** The shared wander clock; every node reads it at its own phase. */
    let drift = 0;
    const places: { x: number; y: number }[] = [];
    return {
      update({ dt, params, changed }) {
        fit(all, params.nodes, () => makeNode(random));
        drift += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        places.length = 0;
        for (const node of all) {
          const x = (node.x + Math.sin(drift + node.phaseX) * WANDER + 1) % 1;
          const y =
            (node.y + Math.cos(drift * 0.83 + node.phaseY) * WANDER + 1) % 1;
          places.push({ x: x * width, y: y * height });
        }
        const threshold = Math.min(width, height) * params.linkDistance;
        context.globalCompositeOperation = "lighter";
        context.lineWidth = 1;

        for (let left = 0; left < places.length; left += 1) {
          const from = places[left];
          if (from === undefined) continue;
          for (let right = left + 1; right < places.length; right += 1) {
            const to = places[right];
            if (to === undefined) continue;
            const span = Math.hypot(to.x - from.x, to.y - from.y);
            if (span > threshold) continue;
            context.beginPath();
            context.moveTo(from.x, from.y);
            context.quadraticCurveTo(
              (from.x + to.x) * 0.5 + Math.sin(drift * 2 + left) * 8,
              (from.y + to.y) * 0.5 + Math.cos(drift * 1.7 + right) * 8,
              to.x,
              to.y,
            );
            context.strokeStyle = cssColor(
              params.color,
              (1 - span / threshold) * 0.34 * params.color[3],
            );
            context.stroke();
          }
          context.beginPath();
          context.arc(from.x, from.y, 1.5, 0, Math.PI * 2);
          context.fillStyle = cssColor(params.color, 0.8 * params.color[3]);
          context.fill();
        }
      },
    };
  },
});
