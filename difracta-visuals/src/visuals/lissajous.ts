import { cssColor, defineVisual } from "@difracta/render/sdk";

/** How many segments the curve is drawn with; enough that 9 by 9 stays smooth. */
const SAMPLES = 320;

export const lissajous = defineVisual({
  id: "lissajous",
  name: "Lissajous",
  description:
    "One glowing parametric curve whose shape comes from the ratio of two frequencies and whose phase turns on its own.",
  notes:
    "An oscilloscope figure: a single continuous stroke that reads as a knot, a ribbon or a flat line depending on the two frequencies. X and Y Frequency are whole numbers and only their ratio matters, so 3 by 2 is the classic pretzel, 1 by 1 is a circle collapsing to a diagonal as Phase turns, and equal frequencies above 1 give a tilted ellipse. Phase is in turns and Speed drives it on its own, so Speed 0 holds whatever Phase is set to and a Link riding Phase can scrub the figure by hand. Size is the figure's half-extent as a share of the Target, so 0.5 touches the edges. Line Width is the stroke in pixels and Glow scales a canvas shadow of it, which is the costly part: at Glow 0 this is one cheap 320-segment stroke, at 1 it is a blurred one. Additive blend mode is what makes it look lit; over a dark Visual it reads as a laser.",
  parameters: {
    color: { kind: "color", label: "Color", default: [0.353, 0.941, 1, 1] },
    frequencyX: {
      kind: "number",
      label: "X Frequency",
      default: 3,
      min: 1,
      max: 9,
      step: 1,
    },
    frequencyY: {
      kind: "number",
      label: "Y Frequency",
      default: 2,
      min: 1,
      max: 9,
      step: 1,
    },
    phase: {
      kind: "number",
      label: "Phase",
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      unit: "turns",
    },
    size: {
      kind: "number",
      label: "Size",
      default: 0.42,
      min: 0.05,
      max: 0.5,
      step: 0.01,
      percent: true,
      description: "The figure's half-extent, as a share of the Target.",
    },
    lineWidth: {
      kind: "number",
      label: "Line Width",
      default: 2.5,
      min: 0.5,
      max: 12,
      step: 0.5,
      unit: "px",
    },
    glow: {
      kind: "number",
      label: "Glow",
      default: 0.65,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.3,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
  },
  create() {
    /** Radians of phase the Visual has turned on its own, on top of Phase. */
    let turned = 0;
    return {
      update({ dt, params, changed }) {
        turned = (turned + dt * params.speed) % (Math.PI * 2);
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        const phase = params.phase * Math.PI * 2 + turned;
        context.beginPath();
        for (let index = 0; index <= SAMPLES; index += 1) {
          const along = (index / SAMPLES) * Math.PI * 2;
          const x =
            width *
            (0.5 + Math.sin(along * params.frequencyX + phase) * params.size);
          const y =
            height * (0.5 + Math.sin(along * params.frequencyY) * params.size);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = params.lineWidth;
        context.strokeStyle = cssColor(params.color);
        context.shadowBlur = params.lineWidth * 4 * params.glow;
        context.shadowColor = cssColor(params.color);
        context.stroke();
        context.shadowBlur = 0;
      },
    };
  },
});
