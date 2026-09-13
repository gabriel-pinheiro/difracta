import { defineShaderVisual } from "@difracta/render/sdk";

export const gradient = defineShaderVisual({
  id: "gradient",
  name: "Gradient",
  description:
    "A still two-color gradient: linear along a direction, radial from the centre, or a frame from the edges inward.",
  recommended: true,
  notes:
    "The everyday shaping tool. The default is a Frame: Color A fills the Surface and fades to a transparent Color B at the edges, a soft-edged wash. Swap the colors, a transparent A and a black B, and it vignettes whatever is below instead. Radial lights the centre of a Surface and Linear grades one side to the other. Spread is the part of the range the transition occupies, anchored at the Color B end, so a small Spread keeps most of the Surface in Color A and puts the blend at the edge. Falloff shapes the blend: Linear is even, Soft eases both ends, Edge holds Color A longest. Direction only acts on Linear, where 0° runs left to right and 90° top to bottom. Nothing moves, so it costs one shader pass when a Parameter changes and nothing after.",
  parameters: {
    type: {
      kind: "choice",
      label: "Type",
      default: "frame",
      options: [
        { value: "linear", label: "Linear" },
        { value: "radial", label: "Radial" },
        { value: "frame", label: "Frame" },
      ],
    },
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 0.85, 0.6, 1],
      description:
        "The start of a Linear gradient, the inside of a Radial or Frame one.",
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0, 0, 0, 0],
      description:
        "The end of a Linear gradient, the outside of a Radial or Frame one.",
    },
    direction: {
      kind: "number",
      label: "Direction",
      default: 0,
      min: 0,
      max: 360,
      step: 1,
      unit: "°",
      description: "The Linear axis: 0° left to right, 90° top to bottom.",
    },
    spread: {
      kind: "number",
      label: "Spread",
      default: 0.15,
      min: 0.01,
      max: 1,
      step: 0.01,
      percent: true,
      description:
        "How much of the range the transition takes, from the Color B end.",
    },
    falloff: {
      kind: "choice",
      label: "Falloff",
      default: "edge",
      options: [
        { value: "linear", label: "Linear" },
        { value: "soft", label: "Soft" },
        { value: "edge", label: "Edge" },
      ],
    },
  },
  fragment: `
float gradient_coordinate(vec2 uv) {
  if (u_type == 0) {
    float angle = radians(u_direction);
    vec2 direction = vec2(cos(angle), sin(angle));
    float half_span = 0.5 * (abs(direction.x) + abs(direction.y));
    return clamp(0.5 + dot(uv - 0.5, direction) / max(2.0 * half_span, 0.000001), 0.0, 1.0);
  }
  if (u_type == 1) return clamp(length((uv - 0.5) * 2.0), 0.0, 1.0);
  vec2 to_edge = min(uv, vec2(1.0) - uv);
  return clamp(1.0 - 2.0 * min(to_edge.x, to_edge.y), 0.0, 1.0);
}

float gradient_falloff(float value) {
  if (u_falloff == 0) return value;
  if (u_falloff == 1) return smoothstep(0.0, 1.0, value);
  return value * value * value;
}

vec4 render_visual(vec2 uv) {
  float coordinate = gradient_coordinate(uv);
  float transition = clamp((coordinate - (1.0 - u_spread)) / u_spread, 0.0, 1.0);
  return mix(u_colorA, u_colorB, gradient_falloff(transition));
}`,
});
