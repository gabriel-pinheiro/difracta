import { defineShaderVisual, ticker } from "@difracta/render/sdk";

/** How long a Pump punch takes to ease back, in seconds, whatever the Rate. */
const PUMP_SECONDS = 0.22;
/** How much closer a full Pump pulls the board, as a share of its size. */
const PUMP_REACH = 0.45;

export const checkerFlicker = defineShaderVisual({
  id: "checker-flicker",
  name: "Checker Flicker",
  description:
    "A hard op-art checkerboard that swaps its two colors on every beat of Rate, punching toward the viewer on each swap and turning if asked.",
  notes:
    "Built to be held on a pad for a drop: it is a full, flickering board from the first frame, and the first frame is already a punch. Cells is how many squares cross the Surface's width; rows follow the aspect so the squares stay square, centred on the Surface. Rate is swaps per second and integrates, so a fader can ride it from a slow alternation to a seizure-grade flicker without a jump; zero holds the board still. Pump pulls the board closer on every swap and eases it back over about a fifth of a second, so the flicker breathes on the beat; at zero the board never moves. Rotation turns the whole board steadily, in degrees per second either way. Color B defaults to transparent, so the swap reveals and hides whatever is below in a checker; give it a color for a solid op-art wall. Edges are antialiased, so fine boards and rotation stay clean. Costs one full-Surface pass on every swap, and every frame while it pumps or turns. Stack Strobe above it for a white-out on the downbeat, or pair it with Zoom Rush on a neighbouring Surface.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 1, 1, 1] },
    colorB: { kind: "color", label: "Color B", default: [0, 0, 0, 0] },
    cells: {
      kind: "number",
      label: "Cells",
      default: 8,
      min: 2,
      max: 48,
      step: 1,
      description: "Squares across the Surface's width.",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 8,
      min: 0,
      max: 30,
      step: 0.5,
      unit: "Hz",
      description: "Swaps per second; zero holds the board.",
    },
    pump: {
      kind: "number",
      label: "Pump",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How far each swap punches the board toward the viewer.",
    },
    rotation: {
      kind: "number",
      label: "Rotation",
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: "°/s",
    },
  },
  fragment: `
uniform bool u_flipped;
uniform float u_zoom;
uniform float u_angle;

vec4 render_visual(vec2 uv) {
  float cell = u_resolution.x / u_cells;
  vec2 p = (uv - 0.5) * u_resolution / (cell * u_zoom);
  float c = cos(u_angle);
  float s = sin(u_angle);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  // A box-filtered checkerboard: exact squares, no shimmer at the edges.
  vec2 w = max(fwidth(p), vec2(0.0001));
  vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5)
    - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
  float board = 0.5 - 0.5 * i.x * i.y;
  if (u_flipped) board = 1.0 - board;
  float alpha = mix(u_colorB.a, u_colorA.a, board);
  vec3 rgb = mix(u_colorB.rgb * u_colorB.a, u_colorA.rgb * u_colorA.a, board);
  return vec4(rgb / max(alpha, 0.0001), alpha);
}`,
  create() {
    const clock = ticker();
    let flipped = false;
    // The first frame is a swap, so the board lands with a punch.
    let sinceSwap = 0;
    let angle = 0;
    let lastZoom = Number.NaN;
    return {
      update({ dt, params, changed }) {
        const fired = clock.advance(dt, params.rate);
        if (fired > 0) {
          if (fired % 2 === 1) flipped = !flipped;
          sinceSwap = clock.phase / params.rate;
        } else sinceSwap += dt;
        angle =
          (angle + ((dt * params.rotation) / 180) * Math.PI) % (Math.PI * 2);
        const recovery = Math.max(0, 1 - sinceSwap / PUMP_SECONDS);
        const zoom =
          1 + params.pump * PUMP_REACH * recovery * recovery * recovery;
        const pumped = zoom !== lastZoom;
        lastZoom = zoom;
        return {
          changed: changed || fired > 0 || pumped || params.rotation !== 0,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { flipped, zoom, angle },
        };
      },
    };
  },
});
