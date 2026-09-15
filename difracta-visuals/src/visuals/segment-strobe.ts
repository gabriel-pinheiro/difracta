import { defineShaderVisual, ticker } from "@difracta/render/sdk";

/** Steps the fragment looks back through; it reads this many ages. */
const MAX_STEPS = 32;
/** The step counter wraps here, far beyond a set, and stays exact as a float. */
const STEP_WRAP = 16777216;

export const LAYOUT_OPTIONS = [
  { value: "columns", label: "Columns" },
  { value: "rows", label: "Rows" },
  { value: "grid", label: "Grid" },
] as const;

export const PATTERN_OPTIONS = [
  { value: "chase", label: "Chase" },
  { value: "bounce", label: "Bounce" },
  { value: "random", label: "Random" },
  { value: "alternate", label: "Alternate" },
  { value: "all", label: "All" },
] as const;

export const segmentStrobe = defineShaderVisual({
  id: "segment-strobe",
  name: "Segment Strobe",
  description:
    "The Surface is cut into segments that strobe one step at a time in a chase, a bounce, at random, alternating or all together, each flash leaving a fading afterglow.",
  notes:
    "Built to be held on a pad through a build or a drop: the first frame already flashes and it keeps stepping for as long as the Layer is enabled. Layout cuts the Surface into Segments columns, Segments rows, or a grid Segments wide with as many rows as keep the cells near square. Every step, at Rate steps per second, Pattern picks what lights: Chase runs Lit Segments along the order (a grid snakes row by row), Bounce runs them there and back, Random lights about Lit Segments anywhere, Alternate flips odd and even (a checkerboard on a grid) and All is a plain strobe. A lit segment shows Flash Color for Flash Duration and then fades through Afterglow Color over Afterglow, which is what turns a chase into a moving comet instead of a blinking bar; Afterglow at zero is a hard, dry strobe. Rate integrates, so a fader can push a chase from a crawl to a blur without a jump; the afterglow is measured in real time, so it keeps its length at any Rate. Gap is a dark gutter in pixels. Between segments and after the glow the Layer is transparent, so it lights whatever is below. Costs one full-Surface pass per frame while anything glows and nothing on frames where a dry strobe holds. Stack it with Barcode Runner on the same drop, or put one Chase on each of two Surfaces with Bounce on a third.",
  parameters: {
    flashColor: {
      kind: "color",
      label: "Flash Color",
      default: [1, 1, 1, 1],
    },
    glowColor: {
      kind: "color",
      label: "Afterglow Color",
      default: [1, 0.16, 0.55, 1],
    },
    layout: {
      kind: "choice",
      label: "Layout",
      default: "columns",
      options: LAYOUT_OPTIONS,
    },
    pattern: {
      kind: "choice",
      label: "Pattern",
      default: "chase",
      options: PATTERN_OPTIONS,
    },
    segments: {
      kind: "number",
      label: "Segments",
      default: 12,
      min: 2,
      max: 32,
      step: 1,
      description:
        "Columns or rows; a grid's columns, its rows follow the aspect.",
    },
    lit: {
      kind: "number",
      label: "Lit Segments",
      default: 1,
      min: 1,
      max: 8,
      step: 1,
      description:
        "How many segments each step lights; Alternate and All ignore it.",
    },
    rate: {
      kind: "number",
      label: "Rate",
      default: 16,
      min: 0.5,
      max: 30,
      step: 0.5,
      unit: "Hz",
      description: "Steps per second.",
    },
    flashDuration: {
      kind: "number",
      label: "Flash Duration",
      default: 40,
      min: 1,
      max: 1000,
      step: 1,
      unit: "ms",
    },
    afterglow: {
      kind: "number",
      label: "Afterglow",
      default: 400,
      min: 0,
      max: 1500,
      step: 10,
      unit: "ms",
    },
    gap: {
      kind: "number",
      label: "Gap",
      default: 3,
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
    },
  },
  fragment: `
uniform float u_step;
uniform float u_ages[${String(MAX_STEPS)}];
uniform float u_age_count;
uniform vec2 u_grid;

float segment_random(float index, float step_index) {
  uint value = uint(step_index) * 4096u + uint(index);
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  return float(value >> 8u) / 16777216.0;
}

// Whether the segment at \`index\` in the running order (and \`parity\` on the
// checkerboard) is lit on step \`step_index\`.
bool lit_on(float index, float parity, float count, float step_index) {
  if (u_pattern == 0) return mod(step_index - index, count) < u_lit;
  if (u_pattern == 1) {
    float period = max(1.0, 2.0 * count - 2.0);
    float t = mod(step_index, period);
    float head = t <= count - 1.0 ? t : period - t;
    float behind = t < count - 1.0 ? head - index : index - head;
    return behind >= 0.0 && behind < u_lit;
  }
  if (u_pattern == 2) return segment_random(index, step_index) < u_lit / count;
  if (u_pattern == 3) return mod(parity + step_index, 2.0) < 0.5;
  return true;
}

vec4 render_visual(vec2 uv) {
  vec2 scaled = uv * u_grid;
  vec2 cell = min(floor(scaled), u_grid - 1.0);
  vec2 cell_size = u_resolution / u_grid;
  vec2 local = fract(scaled) * cell_size;
  float gutter = u_gap * 0.5;
  if (local.x < gutter || local.x > cell_size.x - gutter
    || local.y < gutter || local.y > cell_size.y - gutter) return vec4(0.0);
  float count = u_grid.x * u_grid.y;
  // A grid snakes, so a chase turns the corner instead of jumping back.
  float along = mod(cell.y, 2.0) < 0.5 ? cell.x : u_grid.x - 1.0 - cell.x;
  float index = cell.y * u_grid.x + along;
  float parity = cell.x + cell.y;
  float flash = u_flashDuration / 1000.0;
  float glow = u_afterglow / 1000.0;
  for (int back = 0; back < ${String(MAX_STEPS)}; back += 1) {
    if (float(back) >= u_age_count) break;
    float age = u_ages[back];
    if (age >= flash + glow) break;
    if (!lit_on(index, parity, count, u_step - float(back))) continue;
    if (age < flash) return u_flashColor;
    float fade = (age - flash) / max(glow, 0.0001);
    vec4 color = mix(u_flashColor, u_glowColor, smoothstep(0.0, 0.35, fade));
    return vec4(color.rgb, color.a * pow(1.0 - fade, 1.6));
  }
  return vec4(0.0);
}`,
  create() {
    const clock = ticker();
    // Newest first, in seconds; the step on the first frame is already lit.
    const ages: number[] = [0];
    let step = 0;
    return {
      update({ dt, params, changed, width, height }) {
        const flash = params.flashDuration / 1000;
        const lifetime = flash + params.afterglow / 1000;
        let crossed = false;
        for (let index = 0; index < ages.length; index += 1) {
          const before = ages[index] ?? 0;
          const after = before + dt;
          if (before < flash && after >= flash) crossed = true;
          ages[index] = after;
        }
        const fired = clock.advance(dt, params.rate);
        const period = 1 / params.rate;
        for (let back = Math.min(fired, MAX_STEPS) - 1; back >= 0; back -= 1)
          ages.unshift((clock.phase + back) * period);
        step = (step + fired) % STEP_WRAP;
        const before = ages.length;
        while (ages.length > MAX_STEPS) ages.pop();
        while (ages.length > 0 && (ages[ages.length - 1] ?? 0) >= lifetime)
          ages.pop();
        const dropped = ages.length !== before;
        const columns =
          params.layout === "rows" ? 1 : Math.max(1, params.segments);
        const rows =
          params.layout === "columns"
            ? 1
            : params.layout === "rows"
              ? params.segments
              : Math.max(1, Math.round((params.segments * height) / width));
        const glowing = params.afterglow > 0 && ages.length > 0;
        const invisible =
          params.flashColor[3] <= 0 &&
          (params.glowColor[3] <= 0 || params.afterglow <= 0);
        return {
          changed: changed || fired > 0 || dropped || crossed || glowing,
          blank: ages.length === 0 || invisible,
          uniforms: {
            step,
            ages: Float32Array.from(
              { length: MAX_STEPS },
              (_, index) => ages[index] ?? 0,
            ),
            age_count: ages.length,
            grid: [columns, rows],
          },
        };
      },
    };
  },
});
