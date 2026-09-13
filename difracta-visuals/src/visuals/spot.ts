import { defineShaderVisual } from "@difracta/render/sdk";

export const spot = defineShaderVisual({
  id: "spot",
  name: "Spot",
  description:
    "One still circle of light, sized by the Surface's shorter side, placed anywhere, with a soft edge that fades inward.",
  notes:
    "A fixed spotlight for lighting one thing: the middle of a wall, a corner, a prop. Diameter is a share of the shorter side, so a Spot is round on any Surface and the same size on a wide one as a tall one. Horizontal and Vertical Position place it; with Keep Visible on, the range is the one that keeps the whole circle inside the Surface, so 0% and 100% touch the edges rather than cut the circle in half. Turn it off to let the centre reach the edge and the circle clip. Edge Softness fades inward from the rim as a share of the radius, so softening never grows the light. Additive blend mode lights whatever is below instead of covering it. Nothing moves: one shader pass per Parameter change. For a spot that travels, use Moving Head Spot.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    x: {
      kind: "number",
      label: "Horizontal Position",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    y: {
      kind: "number",
      label: "Vertical Position",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
    },
    diameter: {
      kind: "number",
      label: "Diameter",
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "As a share of the Surface's shorter side.",
    },
    softness: {
      kind: "number",
      label: "Edge Softness",
      default: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "The inward fade from the rim, as a share of the radius.",
    },
    keepVisible: {
      kind: "boolean",
      label: "Keep Visible",
      default: true,
      description:
        "Keep the whole circle inside the Surface rather than letting its centre reach the edge.",
    },
  },
  fragment: `
vec4 render_visual(vec2 uv) {
  vec2 resolution = max(u_resolution, vec2(1.0));
  float diameter = min(resolution.x, resolution.y) * u_diameter;
  float radius = diameter * 0.5;
  vec2 position = vec2(u_x, u_y);
  vec2 clipping_center = position * resolution;
  vec2 contained_center = vec2(radius) + position * max(resolution - vec2(diameter), vec2(0.0));
  vec2 center = u_keepVisible ? contained_center : clipping_center;
  float inside = radius - length(uv * resolution - center);
  float antialias = max(fwidth(inside), 0.5);
  float coverage = smoothstep(0.0, max(radius * u_softness, antialias), inside) * step(0.000001, radius);
  return vec4(u_color.rgb, u_color.a * coverage);
}`,
});
