import { defineFilter } from "@difracta/render/sdk";

export const scanlines = defineFilter({
  id: "scanlines",
  name: "Scanlines",
  description:
    "Darkens the frame in evenly spaced horizontal lines, the way a CRT screen does.",
  notes:
    "A cheap, convincing screen texture: horizontal bands darken the picture without moving it, so nothing is displaced and no Surface loses a pixel. Lines is how many dark bands fill the frame from top to bottom, counted in the projector frame rather than per Surface, so every Surface shares one continuous ruling; set it near the Output's vertical pixel count for a fine grain, or down around 60 for heavy television bars. Strength is how dark the troughs go, from a faint sheen to the picture half gone; Strength is also the switch, and at zero the pass is skipped. It only ever multiplies the color down, so it darkens the Layer overall — lift the Visual below it or the Layer's Mix to get the brightness back. Nothing is animated, so a still Scene under it costs nothing after the first frame. It reads best last in the stack, over Dither or on its own above a bright Visual; stacking it under a displacement Filter smears the lines with the picture, which is usually not what you want.",
  parameters: {
    lines: {
      kind: "number",
      label: "Lines",
      default: 320,
      min: 40,
      max: 1200,
      step: 10,
      description: "How many dark bands fill the frame top to bottom.",
    },
    strength: {
      kind: "number",
      label: "Strength",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec4 color = sample_input(uv);
  float line = 0.5 + 0.5 * sin(uv.y * u_lines * 6.2831853);
  color.rgb *= 1.0 - u_strength * line;
  return color;
}`,
  create() {
    return {
      update({ params, changed }) {
        return { changed, identity: params.strength <= 0 };
      },
    };
  },
});
