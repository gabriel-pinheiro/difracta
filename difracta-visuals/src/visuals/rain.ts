import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

interface Drop {
  /** 0.35 near the back to 1 at the front: size, brightness and pace. */
  readonly depth: number;
  /** The lane it falls down, 0 to 1 of the Target's width. */
  readonly x: number;
  /** 0 above the top edge, 1 at the bottom one, then around again. */
  fall: number;
}

/** Where the streak stops and the splash begins, along the fall. */
const LANDING = 0.92;

function makeDrop(random: Random): Drop {
  return {
    depth: 0.35 + random() * 0.65,
    x: random(),
    fall: random(),
  };
}

export const rain = defineVisual({
  id: "rain",
  name: "Rain",
  description:
    "Depth-layered streaks slant in the wind and, with Splash on, break into a ring at the bottom edge.",
  notes:
    "Weather over anything: thin transparent streaks, near ones longer, brighter and faster than far ones, so it reads as depth rather than as a flat pattern. Drops is how many are falling at once and Streak Length the longest one in Layer pixels, which the depth of each drop scales down; 400 short streaks is drizzle, 100 long ones is a downpour. Wind Slant tilts the streaks and also slides their lanes as they fall, and it goes negative for the other direction. Splash draws a spreading ring where each drop lands, pinned to the bottom edge of the Target: leave it on when the Surface really is the ground or a window, and turn it off on a Surface that hangs in the air, where drops should simply fall out of frame. Fall Speed integrates, so it can be swept live and held at 0 for still rain. Every drop is one thin line, so even the maximum is cheap; put it over a dark Visual, or under one, and add Wave Distortion for a wet window.",
  parameters: {
    color: {
      kind: "color",
      label: "Rain Color",
      default: [0.58, 0.769, 1, 1],
    },
    drops: {
      kind: "number",
      label: "Drops",
      default: 160,
      min: 20,
      max: 400,
      step: 10,
    },
    streak: {
      kind: "number",
      label: "Streak Length",
      default: 26,
      min: 4,
      max: 90,
      step: 1,
      unit: "px",
    },
    slant: {
      kind: "number",
      label: "Wind Slant",
      default: 0.15,
      min: -1,
      max: 1,
      step: 0.05,
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
    splash: {
      kind: "boolean",
      label: "Splash",
      default: true,
      description: "Break each drop into a ring at the Target's bottom edge.",
    },
  },
  create({ random, params }) {
    const all: Drop[] = [];
    fit(all, params.drops, () => makeDrop(random));
    return {
      update({ dt, params, changed }) {
        fit(all, params.drops, () => makeDrop(random));
        for (const drop of all) {
          drop.fall += dt * params.speed * drop.depth * 0.55;
          drop.fall -= Math.floor(drop.fall);
        }
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        context.lineCap = "round";
        for (const drop of all) {
          const streak = params.streak * drop.depth;
          const lane = drop.x + drop.fall * params.slant * 0.2;
          const x = (lane - Math.floor(lane)) * width;

          if (!params.splash || drop.fall < LANDING) {
            const y = drop.fall * (height + streak * 2) - streak;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x - params.slant * streak, y - streak);
            context.strokeStyle = cssColor(
              params.color,
              (0.16 + drop.depth * 0.4) * params.color[3],
            );
            context.lineWidth = 0.6 + drop.depth * 1.1;
            context.stroke();
            continue;
          }

          const spread = (drop.fall - LANDING) / (1 - LANDING);
          context.beginPath();
          context.ellipse(
            x,
            height - 2,
            spread * 14 * drop.depth,
            spread * 4 * drop.depth,
            0,
            0,
            Math.PI * 2,
          );
          context.strokeStyle = cssColor(
            params.color,
            (1 - spread) * 0.5 * drop.depth * params.color[3],
          );
          context.lineWidth = 1;
          context.stroke();
        }
      },
    };
  },
});
