import {
  automaticRate,
  defineShaderVisual,
  rateTimer,
} from "@difracta/render/sdk";

/** Cascades in flight at once; the fragment reads this many. */
const MAX_CASCADES = 24;

/** The option order is the index the fragment dispatches on. */
export const CASCADE_DIRECTIONS = [
  { value: "left-to-right", label: "Left to Right" },
  { value: "right-to-left", label: "Right to Left" },
  { value: "top-to-bottom", label: "Top to Bottom" },
  { value: "bottom-to-top", label: "Bottom to Top" },
  { value: "random", label: "Random" },
] as const;

interface Cascade {
  /** Seconds since the Cue. */
  age: number;
  /** Picks the per-cell order in Random, fixed at the Cue. */
  readonly seed: number;
}

export const tileCascade = defineShaderVisual({
  id: "tile-cascade",
  name: "Tile Cascade",
  description:
    "Every Cascade lights a grid of tiles one rank at a time, holding and fading each; cascades overlap.",
  notes:
    "A hit Visual that sweeps rather than blinks: the Surface is cut into Columns by Rows tiles and every Cascade Cue lights them in ranks, each rank Step later than the one before, holding for Hold and fading over Fade Out. Direction picks the rank order; Random is a real mode, giving each tile its own place in the queue for that Cascade, so the same grid scatters differently every time. Step times the sweep: at zero the whole grid flashes at once, and the sweep's length is Step times the number of ranks, so a wide grid with a long Step runs for seconds. Gap is the dark gutter between tiles in pixels. Automatic Rate cascades on its own for a texture; at zero it is purely played. Two dozen cascades can be in flight and they add, so overlapping hits brighten toward white. Costs nothing between cascades and one full-Surface pass per frame while any is running. Additive blend mode over a Scene makes it a light on top.",
  parameters: {
    color: {
      kind: "color",
      label: "Tile Color",
      default: [1, 0.353, 0.863, 1],
    },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "left-to-right",
      options: CASCADE_DIRECTIONS,
    },
    columns: {
      kind: "number",
      label: "Columns",
      default: 12,
      min: 2,
      max: 24,
      step: 1,
    },
    rows: {
      kind: "number",
      label: "Rows",
      default: 8,
      min: 2,
      max: 16,
      step: 1,
    },
    step: {
      kind: "number",
      label: "Step",
      default: 35,
      min: 0,
      max: 300,
      step: 5,
      unit: "ms",
      description: "How much later each rank lights than the one before.",
    },
    hold: {
      kind: "number",
      label: "Hold",
      default: 90,
      min: 0,
      max: 1000,
      step: 10,
      unit: "ms",
    },
    fadeOut: {
      kind: "number",
      label: "Fade Out",
      default: 280,
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
  cues: [{ key: "cascade", label: "Cascade" }],
  fragment: `
uniform vec2 u_cascades[${String(MAX_CASCADES)}];
uniform float u_cascade_count;

// A separate integer key per seed and tile. The fixed 32-tile stride keeps
// each tile's place in the queue when the grid changes.
float tile_random(vec2 tile, float seed) {
  uint value = (uint(seed) * 32u + uint(tile.y)) * 32u + uint(tile.x);
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  // Keep 24 bits so conversion to float stays exact and never rounds to 1.
  return float(value >> 8u) / 16777216.0;
}

float rank_of(vec2 tile, vec2 grid, float seed) {
  if (u_direction == 0) return tile.x;
  if (u_direction == 1) return grid.x - 1.0 - tile.x;
  if (u_direction == 2) return tile.y;
  if (u_direction == 3) return grid.y - 1.0 - tile.y;
  return floor(tile_random(tile, seed) * max(grid.x, grid.y));
}

// One tile's alpha in one cascade: nothing before its rank, full for the
// hold, then a smooth fade.
float tile_envelope(float local) {
  float hold = u_hold / 1000.0;
  float fade = u_fadeOut / 1000.0;
  if (local < 0.0) return 0.0;
  if (local <= hold) return 1.0;
  return fade <= 0.0 ? 0.0 : 1.0 - smoothstep(hold, hold + fade, local);
}

vec4 render_visual(vec2 uv) {
  vec2 grid = vec2(u_columns, u_rows);
  vec2 tile = floor(uv * grid);
  vec2 tile_size = u_resolution / grid;
  vec2 local = fract(uv * grid) * tile_size;
  vec2 gutter = vec2(u_gap * 0.5);
  float inside = step(gutter.x, local.x) * step(local.x, tile_size.x - gutter.x)
    * step(gutter.y, local.y) * step(local.y, tile_size.y - gutter.y);
  if (inside <= 0.0) return vec4(0.0);
  float light = 0.0;
  for (int index = 0; index < ${String(MAX_CASCADES)}; index += 1) {
    if (float(index) >= u_cascade_count) break;
    float rank = rank_of(tile, grid, u_cascades[index].y);
    light += tile_envelope(u_cascades[index].x - rank * u_step / 1000.0);
  }
  return vec4(u_color.rgb, u_color.a * min(light, 1.0));
}`,
  create({ random }) {
    const cascades: Cascade[] = [];
    const timer = rateTimer(random);
    const start = (): void => {
      cascades.push({ age: 0, seed: Math.floor(random() * 4096) });
      while (cascades.length > MAX_CASCADES) cascades.shift();
    };
    return {
      cue() {
        start();
      },
      update({ dt, params, changed }) {
        for (
          let fired = timer.advance(dt, params.automaticRate);
          fired > 0;
          fired -= 1
        )
          start();
        const ranks =
          params.direction === "top-to-bottom" ||
          params.direction === "bottom-to-top"
            ? params.rows
            : params.direction === "random"
              ? Math.max(params.columns, params.rows)
              : params.columns;
        const lifetime =
          ((ranks - 1) * params.step + params.hold + params.fadeOut) / 1000;
        for (let index = cascades.length - 1; index >= 0; index -= 1) {
          const live = cascades[index];
          if (live === undefined) continue;
          live.age += dt;
          if (live.age >= lifetime) cascades.splice(index, 1);
        }
        // The whole array is set every frame, so the fragment never reads a stale slot.
        const packed = new Float32Array(MAX_CASCADES * 2);
        cascades.forEach((live, index) =>
          packed.set([live.age, live.seed], index * 2),
        );
        return {
          changed: changed || cascades.length > 0,
          blank: cascades.length === 0,
          uniforms: {
            cascades: { size: 2, values: packed },
            cascade_count: cascades.length,
          },
        };
      },
    };
  },
});
