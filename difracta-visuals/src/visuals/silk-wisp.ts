import {
  automaticRate,
  cssColor,
  defineVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Points along one strand; enough that the curve reads as smooth. */
const SEGMENTS = 48;

interface Wisp {
  /** Seconds since the Cue. */
  age: number;
  /** Where the bundle sits, as a signed share of the Surface. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Which way the bundle lies, in radians. */
  readonly direction: number;
}

export const silkWisp = defineVisual({
  id: "silk-wisp",
  name: "Silk Wisp",
  description:
    "Every Wisp unfurls a bundle of fine curved filaments that drifts apart and softly disappears.",
  notes:
    "A soft Visual for quiet passages: fire Wisp and a bundle of Strands draws itself out from a scattered point, leaning at a random angle, swelling to full brightness halfway through Duration and thinning away by the end. It has no hard edge and no hit; it is the opposite of Flash Matrix, and it reads best long, at two seconds or more. Strands is how many filaments the bundle carries, each a little brighter and further out than the last, so a high count reads as silk and a low one as a few hairs. Size is how far a bundle reaches across the Surface and Position Spread scatters where it starts; at zero every wisp grows from the middle. Automatic Rate unfurls wisps on its own for a drifting texture; at zero it is purely played. Wisps overlap freely, each keeping its own place and angle. Cost is Strands polylines per wisp per frame, cheap unless many long wisps overlap. Additive blend mode over a dark Scene is what makes it glow.",
  parameters: {
    color: { kind: "color", label: "Color", default: [0.627, 1, 0, 1] },
    duration: {
      kind: "number",
      label: "Duration",
      default: 4000,
      min: 500,
      max: 12000,
      step: 100,
      unit: "ms",
    },
    strands: {
      kind: "number",
      label: "Strands",
      default: 12,
      min: 1,
      max: 32,
      step: 1,
    },
    size: {
      kind: "number",
      label: "Size",
      default: 0.45,
      min: 0.1,
      max: 1,
      step: 0.05,
      percent: true,
    },
    spread: {
      kind: "number",
      label: "Position Spread",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "wisp", label: "Wisp" }],
  create({ random }) {
    const wisps: Wisp[] = [];
    const timer = rateTimer(random);
    const unfurl = (): void => {
      wisps.push({
        age: 0,
        offsetX: random() - 0.5,
        offsetY: random() - 0.5,
        direction: random() * Math.PI * 2,
      });
    };
    return {
      cue() {
        unfurl();
      },
      update(frame) {
        for (
          let fired = timer.advance(frame.dt, frame.params.automaticRate);
          fired > 0;
          fired -= 1
        )
          unfurl();
        const lifetime = frame.params.duration / 1000;
        for (let index = wisps.length - 1; index >= 0; index -= 1) {
          const live = wisps[index];
          if (live === undefined) continue;
          live.age += frame.dt;
          if (live.age >= lifetime) wisps.splice(index, 1);
        }
        return { blank: wisps.length === 0, changed: wisps.length > 0 };
      },
      render({ context, width, height, params: p }) {
        const scale = Math.min(width, height);
        const strands = Math.round(p.strands);
        const reach = scale * p.size;
        context.globalCompositeOperation = "lighter";
        context.lineWidth = Math.max(0.6, scale * 0.002);
        for (const wisp of wisps) {
          const progress = wisp.age / (p.duration / 1000);
          if (progress <= 0 || progress >= 1) continue;
          const envelope = Math.pow(Math.sin(progress * Math.PI), 1.5);
          const drawn = Math.min(1, progress * 3);
          context.save();
          context.translate(
            width * (0.5 + wisp.offsetX * p.spread),
            height * (0.5 + wisp.offsetY * p.spread),
          );
          context.rotate(wisp.direction);
          for (let strand = 0; strand < strands; strand += 1) {
            const offset = (strand - (strands - 1) / 2) * reach * 0.015;
            context.strokeStyle = cssColor(
              p.color,
              envelope * (0.3 + strand / (strands * 2)) * p.color[3],
            );
            context.beginPath();
            for (let point = 0; point <= SEGMENTS; point += 1) {
              const along = (point / SEGMENTS) * drawn;
              const y =
                Math.sin(along * Math.PI * 2 + progress * 2 + strand * 0.05) *
                  reach *
                  0.22 +
                offset * (0.3 + progress * 2);
              const x = (along - 0.5) * reach * 2;
              if (point === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            }
            context.stroke();
          }
          context.restore();
        }
      },
    };
  },
});
