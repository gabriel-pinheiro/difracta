import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

export const shutter = defineShaderVisual({
  id: "shutter",
  name: "Shutter",
  description:
    "Parallel slats breathe open and shut together like a venetian blind, and snap shut on a Cue.",
  notes:
    "A hard rhythmic mask that works as a Layer of its own or as the thing a Mask is cut from: Slats bands fill the Surface and every one narrows and widens in step, so the Surface reads as closing and reopening rather than as anything moving across it. Openness is how far they open at the top of the cycle: at full they shrink to thin lines and most of the Surface goes dark, at the low end they barely part and it reads as a covered Surface pulsing. Horizontal turns the slats ninety degrees. Speed is cycles per second and integrates, so it can be swept live without the slats jumping; at zero the shutter holds wherever it is and costs nothing. Close snaps it fully shut on the beat and lets it open again from there, so hitting Close on the kick with Speed tuned to the tempo gives a shutter locked to the track; Automatic Rate does the same on its own. Edge Softness feathers each slat and is the difference between a printed grille and a glow. Cheap. Over a Scene on normal blend mode it chops it up; on additive it lights it in stripes. Costs one full-Surface pass per frame while breathing.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    horizontal: {
      kind: "boolean",
      label: "Horizontal",
      default: false,
      description: "Lay the slats across the Surface instead of down it.",
    },
    slats: {
      kind: "number",
      label: "Slats",
      default: 10,
      min: 2,
      max: 40,
      step: 1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0,
      max: 8,
      step: 0.1,
      description: "Open-and-shut cycles per second.",
    },
    openness: {
      kind: "number",
      label: "Openness",
      default: 0.75,
      min: 0.05,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How far the slats part at the top of the cycle.",
    },
    softness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.015,
      min: 0,
      max: 0.15,
      step: 0.005,
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "close", label: "Close" }],
  fragment: `
uniform float u_cycle;

vec4 render_visual(vec2 uv) {
  float axis = u_horizontal ? uv.y : uv.x;
  float within = abs(fract(axis * u_slats) - 0.5) * 2.0;
  float covered = 1.0 - u_cycle * u_openness;
  float alpha = 1.0 - smoothstep(covered - u_softness, covered + u_softness, within);
  return vec4(u_color.rgb, u_color.a * alpha);
}`,
  create({ random }) {
    const timer = rateTimer(random);
    // Zero is fully shut and a half is fully open; the Cue puts it back to zero.
    let phase = random();
    let snapped = false;
    return {
      cue() {
        phase = 0;
        snapped = true;
      },
      update({ dt, params, changed }) {
        if (timer.advance(dt, params.automaticRate) > 0) {
          phase = 0;
          snapped = true;
        }
        const shut = snapped;
        snapped = false;
        phase = (phase + dt * params.speed) % 1;
        return {
          changed: changed || shut || params.speed > 0,
          blank: params.color[3] <= 0,
          uniforms: { cycle: 0.5 - 0.5 * Math.cos(phase * Math.PI * 2) },
        };
      },
    };
  },
});
