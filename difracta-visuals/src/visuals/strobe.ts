import { defineShaderVisual } from "@difracta/render/sdk";

export const strobe = defineShaderVisual({
  id: "strobe",
  name: "Strobe",
  description:
    "Flashes between two colors at a steady rate, each flash a set number of milliseconds long; Rate changes never skip a beat.",
  notes:
    "A two-state light: On Color for Flash Duration at the start of every cycle, Off Color the rest of the time. Off Color defaults to transparent, so the Layer disappears between flashes and whatever is below shows through; a dark Off Color turns it into a hard on/off wall. Rate is flashes per second and integrates, so sweeping it live speeds up or slows down without a jump. Phase Offset shifts where in the cycle the flash sits, for two Strobe Layers alternating on two Surfaces from one Rate. Flash Duration above the cycle length keeps it on. It costs one full-Surface shader pass only on the frames where the state flips.",
  parameters: {
    onColor: { kind: "color", label: "On Color", default: [1, 1, 1, 1] },
    offColor: { kind: "color", label: "Off Color", default: [0, 0, 0, 0] },
    rate: {
      kind: "number",
      label: "Rate",
      default: 2.5,
      min: 0.1,
      max: 20,
      step: 0.1,
      unit: "Hz",
    },
    flashDuration: {
      kind: "number",
      label: "Flash Duration",
      default: 50,
      min: 1,
      max: 1000,
      step: 1,
      unit: "ms",
    },
    phaseOffset: {
      kind: "number",
      label: "Phase Offset",
      default: 0,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
  },
  fragment: `
uniform bool u_on;

vec4 render_visual(vec2 uv) {
  return u_on ? u_onColor : u_offColor;
}`,
  create() {
    let phase = 0;
    let lastOn: boolean | undefined;
    return {
      update({ dt, params, changed }) {
        phase = (phase + dt * params.rate) % 1;
        const onFraction = (params.flashDuration * params.rate) / 1000;
        const cycle = (phase + params.phaseOffset) % 1;
        const on = onFraction >= 1 || cycle < onFraction;
        const flipped = on !== lastOn;
        lastOn = on;
        const shown = on ? params.onColor : params.offColor;
        return {
          changed: changed || flipped,
          blank: shown[3] <= 0,
          uniforms: { on },
        };
      },
    };
  },
});
