import { defineShaderVisual } from "@difracta/render/sdk";

/** Streaks each column can carry at once; the fragment reads this many. */
const SLOTS = 3;

/** The fragment dispatches on the option index; keep this order. */
export const LASER_RAIN_DIRECTIONS = [
  { value: "down", label: "Down" },
  { value: "up", label: "Up" },
] as const;

export const laserRain = defineShaderVisual({
  id: "laser-rain",
  name: "Laser Rain",
  recommended: true,
  description:
    "A curtain of bright, thin laser streaks shoots down or up in random columns, each a white-hot head with a fading colored tail.",
  notes:
    "A high-energy curtain for drops, built to be held on a pad: streaks are already mid-flight on the first frame. The Surface is cut into Columns and each column runs a few streaks at slightly different paces; every pass of a streak re-rolls whether it shows and where in its column it sits, so the pattern never loops visibly. Density is the share of passes that light, from a sparse drizzle to a solid curtain. Speed is Surface heights per second and integrates, so a fader can ride it; at zero every streak freezes where it is and costs nothing. Streak Length is the tail as a share of the Surface height. Width is the core in pixels, and Glow its soft edge; keep Width well under the column spacing or neighbouring streaks will touch. Direction picks falling or rising. Colors are drawn per streak between Color A and Color B, and the head burns toward white. Unlike Rain it is vertical, weightless and neon, and unlike Glyph Rain it has no characters. Costs one full-Surface pass per frame with three streak tests per pixel. Additive blend mode over a Scene is the look; Impact Shake or Barcode Runner over it doubles the drop.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Color A",
      default: [1, 0.15, 0.6, 1],
    },
    colorB: {
      kind: "color",
      label: "Color B",
      default: [0.25, 0.85, 1, 1],
    },
    columns: {
      kind: "number",
      label: "Columns",
      default: 48,
      min: 8,
      max: 160,
      step: 1,
    },
    density: {
      kind: "number",
      label: "Density",
      default: 0.55,
      min: 0.05,
      max: 1,
      step: 0.01,
      percent: true,
      description: "The share of streak passes that light.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 2,
      min: 0,
      max: 8,
      step: 0.05,
      description: "Surface heights per second.",
    },
    length: {
      kind: "number",
      label: "Streak Length",
      default: 0.35,
      min: 0.05,
      max: 1,
      step: 0.01,
      percent: true,
    },
    width: {
      kind: "number",
      label: "Width",
      default: 2,
      min: 0.5,
      max: 8,
      step: 0.5,
      unit: "px",
    },
    glow: {
      kind: "number",
      label: "Glow",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    direction: {
      kind: "choice",
      label: "Direction",
      default: "down",
      options: LASER_RAIN_DIRECTIONS,
    },
  },
  fragment: `
uniform float u_travel;

// Integer mixing keeps each pass's luck exact however far the rain has travelled.
float streak_random(float column, float slot, float pass, uint channel) {
  uint value = uint(int(column)) * 747796405u ^ uint(int(slot)) * 2891336453u
    ^ uint(int(pass)) * 1181783497u ^ channel * 277803737u;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value = (value ^ (value >> 16u)) * 0x45d9f3bu;
  value ^= value >> 16u;
  return float(value >> 8u) / 16777216.0;
}

vec4 render_visual(vec2 uv) {
  float along = u_direction == 0 ? uv.y : 1.0 - uv.y;
  float column = floor(uv.x * u_columns);
  float cell = u_resolution.x / u_columns;
  float local = fract(uv.x * u_columns) * cell;
  float half_width = u_width * 0.5;
  float glow_reach = max(0.75, u_width * 1.2);
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int index = 0; index < ${String(SLOTS)}; index += 1) {
    float slot = float(index);
    float offset = streak_random(column, slot, 0.0, 0u);
    // A pass is longer than the Surface plus the tail, so a streak leaves before it returns.
    float period = 1.0 + u_length + streak_random(column, slot, 0.0, 1u) * 1.2;
    float rate = 0.75 + 0.5 * streak_random(column, slot, 0.0, 2u);
    float travelled = u_travel * rate + offset * period - along;
    float pass = floor(travelled / period);
    float behind = travelled - pass * period;
    if (behind > u_length) continue;
    float luck = streak_random(column, slot, pass, 3u);
    if (luck >= u_density) continue;
    float centre = cell * (0.3 + 0.4 * streak_random(column, slot, pass, 4u));
    float across = abs(local - centre);
    float core = 1.0 - smoothstep(half_width, half_width + 1.0, across);
    float halo = u_glow * 0.55 * exp(-across / glow_reach);
    float tail = pow(1.0 - behind / u_length, 1.8);
    float head = exp(-behind * u_resolution.y / max(3.0, u_width * 4.0));
    float light = (core + halo) * max(tail, head);
    vec4 color = mix(u_colorA, u_colorB, streak_random(column, slot, pass, 5u));
    vec3 hot = mix(color.rgb, vec3(1.0), head * 0.8);
    rgb += hot * color.a * light;
    alpha += color.a * light;
  }
  alpha = min(alpha, 1.0);
  return vec4(min(rgb, vec3(1.0)) / max(alpha, 0.0001), alpha);
}`,
  create({ random }) {
    // Not periodic, so the clock is not wrapped; each press starts mid-flight somewhere new.
    let travel = random() * 64;
    return {
      update({ dt, params, changed }) {
        travel += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          uniforms: { travel },
        };
      },
    };
  },
});
