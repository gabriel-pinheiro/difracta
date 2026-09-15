import { defineShaderVisual } from "@difracta/render/sdk";

/** The most Acceleration can multiply Speed by, however long it is held. */
const MAX_BOOST = 4;

export const SHAPE_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
] as const;

export const DIRECTION_OPTIONS = [
  { value: "outward", label: "Outward" },
  { value: "inward", label: "Inward" },
] as const;

export const zoomRush = defineShaderVisual({
  id: "zoom-rush",
  name: "Zoom Rush",
  recommended: true,
  description:
    "Thick flat bands of two colors rush out of the centre of the Surface, or into it, as squares, circles or diamonds, faster the longer it is held.",
  notes:
    "Built to be held on a pad through a drop or the last bars of a build: a full Surface of bold, hard-edged bands from the first frame, the flat graphic opposite of Tunnel's thin depth lines. Shape is the outline of every band; Direction sends them out of the centre or into it. Bands is how many colors cross from the centre to the middle of the shorter side, so 4 is a few fat slabs and 16 a dense hypnotic ripple. Perspective bunches the bands near the centre and stretches them toward the edges, so they seem to fly past the viewer; at zero they are evenly spaced. Speed is bands per second and integrates, so a fader can ride it without a jump and zero freezes it for nothing. Acceleration speeds the rush up the longer the pad is held, by that share of Speed every second, up to four times Speed; every press starts again from Speed, so a held build gets tighter on its own. Colors A and B alternate; a transparent Color B leaves rings that fly over whatever is below. Costs one full-Surface pass per frame while moving. Pair it with Strobe on the same pad for a drop, or Checker Flicker on a neighbouring Surface.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0.08, 0.5, 1] },
    colorB: { kind: "color", label: "Color B", default: [0.04, 0.02, 0.1, 1] },
    shape: {
      kind: "choice",
      label: "Shape",
      default: "square",
      options: SHAPE_OPTIONS,
    },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "outward",
      options: DIRECTION_OPTIONS,
    },
    bands: {
      kind: "number",
      label: "Bands",
      default: 6,
      min: 2,
      max: 24,
      step: 1,
      description: "Bands from the centre to the middle of the shorter side.",
    },
    perspective: {
      kind: "number",
      label: "Perspective",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How much the bands bunch at the centre and widen outward.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 2.5,
      min: 0,
      max: 12,
      step: 0.1,
      unit: "bands/s",
    },
    acceleration: {
      kind: "number",
      label: "Acceleration",
      default: 0,
      min: 0,
      max: 2,
      step: 0.05,
      unit: "x/s",
      description:
        "How much faster it rushes each second it is held, as a share of Speed, up to 4x.",
    },
  },
  fragment: `
uniform float u_travel;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * u_resolution / (0.5 * min(u_resolution.x, u_resolution.y));
  float d;
  if (u_shape == 0) d = max(abs(p.x), abs(p.y));
  else if (u_shape == 1) d = length(p);
  else d = (abs(p.x) + abs(p.y)) * 0.7071;
  float bend = 1.0 / (1.0 + 2.0 * u_perspective);
  float band = pow(max(d, 0.0001), bend) * u_bands - u_travel;
  float w = max(fwidth(band), 0.0001);
  // A square wave filtered by its own slope: hard bands, clean edges.
  float a_side = clamp(0.5 + 0.5 * sin(band * 3.14159265) / (3.14159265 * w), 0.0, 1.0);
  float alpha = mix(u_colorB.a, u_colorA.a, a_side);
  vec3 rgb = mix(u_colorB.rgb * u_colorB.a, u_colorA.rgb * u_colorA.a, a_side);
  return vec4(rgb / max(alpha, 0.0001), alpha);
}`,
  create() {
    let travel = 0;
    let held = 0;
    return {
      update({ dt, params, changed }) {
        held += dt;
        const boost = Math.min(MAX_BOOST, 1 + params.acceleration * held);
        const sign = params.direction === "inward" ? -1 : 1;
        // Two bands make one A and B pair, so the picture repeats every 2.
        travel = (travel + dt * params.speed * boost * sign + 2) % 2;
        return {
          changed: changed || params.speed > 0,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { travel },
        };
      },
    };
  },
});
