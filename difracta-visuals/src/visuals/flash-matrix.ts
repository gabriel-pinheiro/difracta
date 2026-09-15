import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Flashes in flight at once; the fragment reads this many. */
const MAX_FLASHES = 24;

interface Flash {
  /** Seconds since the Cue. */
  age: number;
  /** Picks which cells light and when, fixed at the Cue. */
  readonly seed: number;
}

export const flashMatrix = defineShaderVisual({
  id: "flash-matrix",
  name: "Flash Matrix",
  description:
    "Every Flash lights a random selection of cells in a grid, each after its own short delay, holding and fading out; flashes overlap.",
  recommended: true,
  notes:
    "A hit Visual for walls and ceilings: the Surface is cut into Columns by Rows cells and every Flash Cue gives each cell a Coverage chance to light, each cell starting within Delay Spread, holding for Hold and fading over Fade Out, so one hit reads as a scatter of sparks rather than a single blink. Coverage is an average share, so the count varies per Flash. Cell colors are drawn between Cell Color A and B per cell. Gap is the dark gutter between cells in pixels. Automatic Rate fires flashes on its own, jittered around the mean, for a texture that needs no Cues; leave it at zero for a purely played instrument. Flashes overlap up to two dozen in flight and add up, so a fast pattern brightens toward white. Changing Columns or Rows keeps each cell's own luck, only the grid moves. Costs nothing between flashes and one full-Surface pass per frame while any is lit. Additive blend mode over a Scene makes it a light on top.",
  parameters: {
    colorA: { kind: "color", label: "Cell Color A", default: [1, 1, 1, 1] },
    colorB: {
      kind: "color",
      label: "Cell Color B",
      default: [0.314, 0.863, 1, 1],
    },
    columns: {
      kind: "number",
      label: "Columns",
      default: 14,
      min: 2,
      max: 32,
      step: 1,
    },
    rows: {
      kind: "number",
      label: "Rows",
      default: 9,
      min: 2,
      max: 24,
      step: 1,
    },
    coverage: {
      kind: "number",
      label: "Coverage",
      default: 0.35,
      min: 0.01,
      max: 1,
      step: 0.01,
      percent: true,
      description: "The share of cells each flash lights.",
    },
    delaySpread: {
      kind: "number",
      label: "Delay Spread",
      default: 100,
      min: 0,
      max: 1000,
      step: 10,
      unit: "ms",
    },
    hold: {
      kind: "number",
      label: "Hold",
      default: 70,
      min: 0,
      max: 1000,
      step: 10,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 260,
      min: 0,
      max: 2000,
      step: 10,
      unit: "ms",
    },
    gap: {
      kind: "number",
      label: "Gap",
      default: 2,
      min: 0,
      max: 12,
      step: 1,
      unit: "px",
    },
    automaticRate: automaticRate({ default: 0, max: 8, step: 0.1 }),
  },
  cues: [{ key: "flash", label: "Flash" }],
  fragment: `
uniform vec2 u_flashes[${String(MAX_FLASHES)}];
uniform float u_flash_count;

// Separate integer keys for each seed, cell and channel. The fixed 32-cell
// stride preserves each cell's luck when the grid changes. Integer mixing
// avoids the precision loss of a sine hash with large seeded coordinates.
float cell_random(vec2 cell, float seed, uint channel) {
  uint value = ((uint(seed) * 32u + uint(cell.y)) * 32u + uint(cell.x)) * 4u + channel;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  // Keep 24 bits so conversion to float stays exact and never rounds to 1.
  return float(value >> 8u) / 16777216.0;
}

// One cell's alpha in one flash: nothing before its delay, full for the
// hold, then a smooth fade.
float cell_envelope(float age, float delay) {
  float local = age - delay;
  float hold = u_hold / 1000.0;
  float fade = u_fadeOut / 1000.0;
  if (local < 0.0) return 0.0;
  if (local <= hold) return 1.0;
  return fade <= 0.0 ? 0.0 : 1.0 - smoothstep(hold, hold + fade, local);
}

vec4 render_visual(vec2 uv) {
  vec2 grid = vec2(u_columns, u_rows);
  vec2 cell = floor(uv * grid);
  vec2 cell_size = u_resolution / grid;
  vec2 local = fract(uv * grid) * cell_size;
  vec2 gutter = vec2(u_gap * 0.5);
  float inside = step(gutter.x, local.x) * step(local.x, cell_size.x - gutter.x)
    * step(gutter.y, local.y) * step(local.y, cell_size.y - gutter.y);
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int index = 0; index < ${String(MAX_FLASHES)}; index += 1) {
    if (float(index) >= u_flash_count) break;
    float age = u_flashes[index].x;
    float seed = u_flashes[index].y;
    if (cell_random(cell, seed, 0u) >= u_coverage) continue;
    float delay = cell_random(cell, seed, 1u) * u_delaySpread / 1000.0;
    float lit = cell_envelope(age, delay);
    if (lit <= 0.0) continue;
    vec4 color = mix(u_colorA, u_colorB, cell_random(cell, seed, 2u));
    rgb += color.rgb * color.a * lit;
    alpha += color.a * lit;
  }
  alpha = min(alpha, 1.0);
  return vec4(min(rgb, vec3(1.0)) / max(alpha, 0.0001), alpha * inside);
}`,
  create({ random }) {
    const flashes: Flash[] = [];
    const timer = rateTimer(random);
    const flash = (): void => {
      flashes.push({ age: 0, seed: Math.floor(random() * 4096) });
      while (flashes.length > MAX_FLASHES) flashes.shift();
    };
    return {
      cue() {
        flash();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          flash();
        const lifetime =
          (params.delaySpread + params.hold + params.fadeOut) / 1000;
        for (let index = flashes.length - 1; index >= 0; index -= 1) {
          const live = flashes[index];
          if (live === undefined) continue;
          live.age += dt;
          if (live.age >= lifetime) flashes.splice(index, 1);
        }
        // The whole array is set every frame, so the fragment never reads a stale slot.
        const packed = new Float32Array(MAX_FLASHES * 2);
        flashes.forEach((live, index) =>
          packed.set([live.age, live.seed], index * 2),
        );
        return {
          changed: changed || flashes.length > 0,
          blank: flashes.length === 0,
          uniforms: {
            flashes: { size: 2, values: packed },
            flash_count: flashes.length,
          },
        };
      },
    };
  },
});
