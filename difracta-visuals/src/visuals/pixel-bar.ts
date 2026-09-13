import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
  type PathGeometry,
} from "@difracta/render/sdk";

import {
  pixelBarLifetime,
  pixelBarPixelAlpha,
  type PixelBarDirection,
} from "./pixel-bar-motion.ts";

/** One pixel of the bar: a rectangle along one arc of the Path. */
interface Segment {
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  readonly length: number;
}

interface Launch {
  /** Traversals of the bar since the Launch. */
  travel: number;
  readonly direction: PixelBarDirection;
}

function segments(path: PathGeometry, count: number): Segment[] {
  const list: Segment[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = path.at(index / count);
    const end = path.at((index + 1) / count);
    list.push({
      angle: Math.atan2(end.y - start.y, end.x - start.x),
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      length: Math.hypot(end.x - start.x, end.y - start.y),
    });
  }
  return list;
}

export const pixelBar = defineVisual({
  id: "pixel-bar",
  name: "Pixel Bar",
  description:
    "An LED bar along a Path: every Launch sends a lit packet with a glowing trail from one end to the other over the dark pixels.",
  notes:
    "A pixel strip drawn wherever a Path goes, along an edge, a beam or around a frame: the Path is cut into Pixels rectangles of Thickness pixels with a Gap between them, painted in Background Color and always visible, and each Launch Cue lights a packet in Effect Color that runs the bar. Comet drags a Trail of that many pixels, Scanner is one hard pixel, Split leaves from the middle both ways, Bounce goes to the end and back. Direction is Forward from the Path's first point, Reverse, or Alternate per Launch. Speed is in traversals per second; a packet lives until its trail has left the bar. Automatic Rate launches on its own, jittered around the mean; Trigger Chance drops some Launches at random. Packets overlap freely and add up. Costs one canvas draw per frame while a packet runs and nothing while the bar is dark; the glow is a canvas shadow scaled by Thickness, the costly part on a slow Output.",
  parameters: {
    backgroundColor: {
      kind: "color",
      label: "Background Color",
      default: [0.031, 0.071, 0.11, 0.588],
    },
    effectColor: {
      kind: "color",
      label: "Effect Color",
      default: [0.314, 0.922, 1, 1],
    },
    effect: {
      kind: "choice",
      label: "Effect",
      default: "comet",
      options: [
        { value: "comet", label: "Comet" },
        { value: "scanner", label: "Scanner" },
        { value: "split", label: "Split" },
        { value: "bounce", label: "Bounce" },
      ],
    },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "alternate",
      options: [
        { value: "forward", label: "Forward" },
        { value: "reverse", label: "Reverse" },
        { value: "alternate", label: "Alternate" },
      ],
      description: "Split ignores it, leaving from the middle both ways.",
    },
    pixels: {
      kind: "number",
      label: "Pixels",
      default: 32,
      min: 4,
      max: 128,
      step: 1,
    },
    gap: {
      kind: "number",
      label: "Gap",
      default: 3,
      min: 0,
      max: 20,
      step: 1,
      unit: "px",
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 16,
      min: 2,
      max: 100,
      step: 1,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.8,
      min: 0.2,
      max: 4,
      step: 0.05,
      unit: "bars/s",
    },
    trail: {
      kind: "number",
      label: "Trail",
      default: 8,
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      description: "Pixels lit behind the head; Scanner ignores it.",
    },
    chance: {
      kind: "number",
      label: "Trigger Chance",
      default: 1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  paths: [{ key: "path", label: "Bar Path" }],
  cues: [{ key: "launch", label: "Launch" }],
  create({ random, params: initial, paths: initialPaths }) {
    const launches: Launch[] = [];
    const timer = rateTimer(random);
    let params = initial;
    let bar = segments(initialPaths.path, Math.round(params.pixels));
    let launched = 0;
    const launch = (): void => {
      launched += 1;
      const direction: PixelBarDirection =
        params.direction === "alternate"
          ? launched % 2 === 0
            ? "reverse"
            : "forward"
          : params.direction;
      launches.push({ travel: 0, direction });
    };
    return {
      cue() {
        if (random() < params.chance) launch();
      },
      update(frame) {
        params = frame.params;
        if (frame.changed)
          bar = segments(frame.paths.path, Math.round(params.pixels));
        for (
          let fired = timer.advance(frame.dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          launch();
        const end = pixelBarLifetime(params.effect, bar.length, params.trail);
        for (let index = launches.length - 1; index >= 0; index -= 1) {
          const live = launches[index];
          if (live === undefined) continue;
          live.travel += frame.dt * params.speed;
          if (live.travel >= end) launches.splice(index, 1);
        }
        return {
          changed: frame.changed || launches.length > 0,
          blank: launches.length === 0 && params.backgroundColor[3] <= 0,
        };
      },
      render({ context, params: p }) {
        const paint = (segment: Segment, color: string): void => {
          context.save();
          context.translate(segment.x, segment.y);
          context.rotate(segment.angle);
          context.fillStyle = color;
          context.fillRect(
            -segment.length / 2 + p.gap / 2,
            -p.thickness / 2,
            Math.max(0, segment.length - p.gap),
            p.thickness,
          );
          context.restore();
        };
        context.globalCompositeOperation = "source-over";
        const background = cssColor(p.backgroundColor);
        for (const segment of bar) paint(segment, background);
        if (launches.length === 0) return;
        context.globalCompositeOperation = "lighter";
        context.shadowBlur = p.thickness * 0.8;
        context.shadowColor = cssColor(p.effectColor, 0.9 * p.effectColor[3]);
        for (const live of launches)
          bar.forEach((segment, pixelIndex) => {
            const alpha = pixelBarPixelAlpha({
              direction: live.direction,
              effect: p.effect,
              pixelCount: bar.length,
              pixelIndex,
              travel: live.travel,
              trail: p.trail,
            });
            if (alpha > 0)
              paint(segment, cssColor(p.effectColor, alpha * p.effectColor[3]));
          });
        context.shadowBlur = 0;
      },
    };
  },
});
