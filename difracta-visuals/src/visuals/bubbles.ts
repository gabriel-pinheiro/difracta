import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

interface Bubble {
  readonly radiusScale: number;
  /** How fast this bubble rises relative to Rise Speed. */
  readonly riseRate: number;
  readonly x: number;
  readonly swayRate: number;
  readonly wobbleRate: number;
  /** 0 at the bottom, 1 at the top, then around again. */
  rise: number;
  sway: number;
  wobble: number;
}

function makeBubble(random: Random): Bubble {
  return {
    radiusScale: 0.3 + Math.pow(random(), 1.4) * 0.9,
    riseRate: 0.25 + 0.4 * random(),
    x: random(),
    swayRate: 0.5 + random(),
    wobbleRate: 2 + random() * 2,
    rise: random(),
    sway: random() * Math.PI * 2,
    wobble: random() * Math.PI * 2,
  };
}

export const bubbles = defineVisual({
  id: "bubbles",
  name: "Bubbles",
  description:
    "Translucent outlined bubbles wobble and rise, each at its own pace. Rise Speed changes carry every bubble on from where it is.",
  notes:
    "A light, airy overlay: the fill is almost transparent and the outline carries the shape, so it works over any other Visual and over Solid Color. Bubbles fade in at the bottom and out at the top of the Target, so nothing pops at the edges. Bubble Size is the largest radius in Layer pixels; Bubbles is how many are in flight at once, and both can change live without disturbing the ones already rising. Rise Speed around 0.3 feels underwater, above 1.5 reads as fizz. Highlight is the small specular dot; set its alpha to zero for flat rings. Additive blend mode makes them glow on dark grounds.",
  parameters: {
    color: {
      kind: "color",
      label: "Bubble Color",
      default: [0.659, 0.878, 1, 1],
    },
    highlight: { kind: "color", label: "Highlight", default: [1, 1, 1, 1] },
    count: {
      kind: "number",
      label: "Bubbles",
      default: 50,
      min: 5,
      max: 160,
      step: 5,
    },
    size: {
      kind: "number",
      label: "Bubble Size",
      default: 16,
      min: 4,
      max: 60,
      step: 1,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Rise Speed",
      default: 0.5,
      min: 0.05,
      max: 2,
      step: 0.05,
      unit: "x",
    },
  },
  create({ random, params }) {
    const all: Bubble[] = [];
    fit(all, params.count, () => makeBubble(random));
    return {
      update({ dt, params }) {
        fit(all, params.count, () => makeBubble(random));
        for (const bubble of all) {
          bubble.rise += dt * params.speed * bubble.riseRate;
          bubble.rise -= Math.floor(bubble.rise);
          bubble.sway += dt * bubble.swayRate;
          bubble.wobble += dt * bubble.wobbleRate;
        }
      },
      render({ context, width, height, params }) {
        for (const bubble of all) {
          const radius = params.size * bubble.radiusScale;
          const y = height * (1.05 - bubble.rise * 1.15);
          const x = (bubble.x + Math.sin(bubble.sway) * 0.025) * width;
          const fade =
            Math.min(1, bubble.rise * 8) * Math.min(1, (1 - bubble.rise) * 6);
          const wobble = Math.sin(bubble.wobble) * 0.07;

          context.beginPath();
          context.ellipse(
            x,
            y,
            radius * (1 + wobble),
            radius * (1 - wobble),
            0,
            0,
            Math.PI * 2,
          );
          context.fillStyle = cssColor(
            params.color,
            0.08 * fade * params.color[3],
          );
          context.fill();
          context.strokeStyle = cssColor(
            params.color,
            0.55 * fade * params.color[3],
          );
          context.lineWidth = Math.max(1, radius * 0.14);
          context.stroke();

          context.beginPath();
          context.arc(
            x - radius * 0.35,
            y - radius * 0.4,
            radius * 0.22,
            0,
            Math.PI * 2,
          );
          context.fillStyle = cssColor(
            params.highlight,
            0.5 * fade * params.highlight[3],
          );
          context.fill();
        }
      },
    };
  },
});
