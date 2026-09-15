import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

interface Flake {
  /** 0.3 far away to 1 close: size, brightness and pace all follow it. */
  readonly depth: number;
  /** The column it falls down, 0 to 1 of the Target's width. */
  readonly x: number;
  readonly swayRate: number;
  /** 0 at the top edge, 1 past the bottom one, then around again. */
  fall: number;
  sway: number;
  shimmer: number;
}

function makeFlake(random: Random): Flake {
  return {
    // Biased toward the far layers, so a few big flakes lead many small ones.
    depth: 0.3 + Math.pow(random(), 1.6) * 0.7,
    x: random(),
    swayRate: 0.4 + random() * 0.6,
    fall: random(),
    sway: random() * Math.PI * 2,
    shimmer: random() * 6,
  };
}

export const snowDrift = defineVisual({
  id: "snow-drift",
  name: "Snow Drift",
  description:
    "Soft depth-layered flakes fall and wander sideways, near ones larger, brighter and faster than far ones.",
  notes:
    "Quiet weather that sits over anything: round, softly lit dots on transparency, so it wants a dark Visual or a Solid Color below it. Flakes is how many are in the air and Flake Size the largest radius in Layer pixels, which each flake's depth scales down, so 400 flakes at 2 px is a blizzard seen from far off and 60 at 8 px is a slow, close fall. Drift is how far flakes wander sideways as they come down; at 0 they fall straight and the Visual turns mechanical, and above about 2 it reads as wind. Fall Speed scales the fall, the wander and the shimmer together, so 0 holds the snow still in the air rather than clearing it, and any of these can be swept live without a flake jumping. Each flake is one filled arc, so the maximum count is still cheap. Pair it with Blur or a low-opacity Layer of the same Visual at a different Flake Size for real depth.",
  parameters: {
    color: {
      kind: "color",
      label: "Flake Color",
      default: [0.941, 0.973, 1, 1],
    },
    flakes: {
      kind: "number",
      label: "Flakes",
      default: 140,
      min: 20,
      max: 400,
      step: 10,
    },
    size: {
      kind: "number",
      label: "Flake Size",
      default: 3,
      min: 1,
      max: 10,
      step: 0.5,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Fall Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    drift: {
      kind: "number",
      label: "Drift",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  create({ random, params }) {
    const all: Flake[] = [];
    fit(all, params.flakes, () => makeFlake(random));
    return {
      update({ dt, params, changed }) {
        fit(all, params.flakes, () => makeFlake(random));
        const step = dt * params.speed;
        for (const flake of all) {
          flake.fall += step * flake.depth * 0.09;
          flake.fall -= Math.floor(flake.fall);
          flake.sway += step * flake.swayRate;
          flake.shimmer += step * 2;
        }
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        for (const flake of all) {
          const sway = Math.sin(flake.sway) * 0.04 * params.drift * flake.depth;
          const x = (flake.x + sway + flake.fall * 0.02) * width;
          const y = (flake.fall * 1.1 - 0.05) * height;
          const shimmer = 0.75 + 0.25 * Math.sin(flake.shimmer);

          context.beginPath();
          context.arc(x, y, params.size * flake.depth, 0, Math.PI * 2);
          context.fillStyle = cssColor(
            params.color,
            flake.depth * shimmer * params.color[3],
          );
          context.fill();
        }
      },
    };
  },
});
