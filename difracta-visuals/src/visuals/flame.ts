import { defineShaderVisual } from "@difracta/render/sdk";

export const flame = defineShaderVisual({
  id: "flame",
  name: "Flame",
  description:
    "A procedural fire rises from the bottom edge, licking sideways and thinning out with height through base, body and tip colors.",
  notes:
    "Fire along the bottom of a Surface: a column, a hearth or a wall of flame, transparent above the tips so a Scene shows through. Flame Height is how far up the fire reaches as a share of the Surface, Detail the spatial frequency of the noise (low is a few fat tongues, high a fine crackling fire), and the two interact: a tall flame at high Detail is busy, a short one at low Detail reads as a calm hearth. Sway is how far the tongues lick sideways and Rise how fast the noise scrolls upward, so a fast Rise with little Sway reads as a draught and the reverse as a lazy fire. Base Color is the dark root, Flame Color the body (its alpha scales the whole fire's opacity) and Tip Color the hottest crests. Speed scales both Rise and Sway and integrates, so it can be swept live and stopped without a jump; at zero the fire freezes and costs nothing. Moderately expensive: two five-octave fbm evaluations per fragment, so ten noise lookups on every pixel of the Surface. Stack it under an Additive Layer or a Bloom-like Filter for a hotter core.",
  parameters: {
    base: {
      kind: "color",
      label: "Base Color",
      default: [0.471, 0.039, 0.02, 1],
    },
    flame: {
      kind: "color",
      label: "Flame Color",
      default: [1, 0.471, 0.078, 1],
    },
    tip: { kind: "color", label: "Tip Color", default: [1, 0.922, 0.627, 1] },
    height: {
      kind: "number",
      label: "Flame Height",
      default: 0.65,
      min: 0.2,
      max: 1,
      step: 0.05,
      percent: true,
    },
    detail: {
      kind: "number",
      label: "Detail",
      default: 3,
      min: 1,
      max: 8,
      step: 0.5,
      description: "Spatial frequency of the fire noise: higher is finer.",
    },
    sway: {
      kind: "number",
      label: "Sway",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How far the tongues lick sideways.",
    },
    rise: {
      kind: "number",
      label: "Rise",
      default: 1.8,
      min: 0,
      max: 6,
      step: 0.1,
      description: "How fast the fire noise scrolls upward.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float flame_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float flame_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = flame_hash(cell);
  float b = flame_hash(cell + vec2(1.0, 0.0));
  float c = flame_hash(cell + vec2(0.0, 1.0));
  float d = flame_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float flame_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 5; octave += 1) {
    value += amplitude * flame_noise(position);
    position = turn * position * 2.02 + 19.19;
    amplitude *= 0.5;
  }
  return value;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  float from_bottom = 1.0 - uv.y;

  // Sideways licking distorts the sample column before the main noise.
  vec2 warp = vec2(
    flame_fbm(vec2(uv.x * aspect * 3.0, uv.y * 3.0 + u_time * 1.4)) - 0.5,
    0.0
  ) * u_sway * min(1.0, from_bottom * 2.0);
  vec2 sample_position =
    (uv + warp) * vec2(aspect, 1.0) * u_detail + vec2(0.0, u_time * u_rise);
  float noise = flame_fbm(sample_position);

  // Flames thin out with height; the noise eats into the body from above.
  float body = noise * 1.6 - from_bottom / max(0.0001, u_height);
  float intensity = clamp(body + 0.55, 0.0, 1.0);
  intensity *= smoothstep(0.0, 0.08, from_bottom);

  vec3 rgb = u_base.rgb;
  rgb = mix(rgb, u_flame.rgb, smoothstep(0.15, 0.6, intensity));
  rgb = mix(rgb, u_tip.rgb, smoothstep(0.62, 0.95, intensity));

  float alpha = smoothstep(0.06, 0.35, intensity) * u_flame.a;
  return vec4(rgb * smoothstep(0.02, 0.3, intensity), alpha);
}`,
  create({ random }) {
    let time = 0;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          blank: params.flame[3] <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
