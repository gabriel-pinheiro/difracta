import { defineShaderVisual } from "@difracta/render/sdk";

export const smoke = defineShaderVisual({
  id: "smoke",
  name: "Smoke",
  description:
    "Slow curtains of coloured smoke fold and drift sideways over a dark background, brightening where the folds line up.",
  notes:
    "A calm, slow ambient wash: broad vertical curtains that cross the Surface and fold into each other, closer to an aurora than to a smoke machine. Color A appears in the dense folds and Color B at their fringes, so two close hues read as one gas and two far apart as separate curtains; both alphas scale how far the smoke covers the Background. Background is what shows between the curtains and its alpha is the Visual's floor opacity, so dropping it lets a Scene through. Scale is how many curtains cross the Surface — around 3 reads as smoke, above 6 as a fine mist. Intensity widens and brightens each curtain; past about 2 they merge into one sheet. Speed integrates, so it can be swept live and stopped without a jump, and stopped smoke costs nothing; it is slow by design, and above about 0.6 it reads as wind rather than drift. Moderately expensive: three five-octave fbm evaluations per fragment. Good under a Layer with a hard shape, and it takes a Blur or a Chromatic Aberration Filter well.",
  parameters: {
    background: {
      kind: "color",
      label: "Background",
      default: [0.008, 0.02, 0.071, 0.922],
    },
    colorA: { kind: "color", label: "Color A", default: [0.102, 1, 0.675, 1] },
    colorB: { kind: "color", label: "Color B", default: [0.455, 0.227, 1, 1] },
    intensity: {
      kind: "number",
      label: "Intensity",
      default: 1.35,
      min: 0.2,
      max: 3,
      step: 0.05,
    },
    scale: {
      kind: "number",
      label: "Scale",
      default: 3.2,
      min: 0.5,
      max: 10,
      step: 0.1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.18,
      min: 0,
      max: 2,
      step: 0.02,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float smoke_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float smoke_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = smoke_hash(cell);
  float b = smoke_hash(cell + vec2(1.0, 0.0));
  float c = smoke_hash(cell + vec2(0.0, 1.0));
  float d = smoke_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float smoke_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 5; octave += 1) {
    value += amplitude * smoke_noise(position);
    position = turn * position * 2.03 + 19.17;
    amplitude *= 0.5;
  }
  return value;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0) * u_scale;
  vec2 warp = vec2(
    smoke_fbm(position * 0.55 + vec2(u_time * 0.3, -u_time * 0.12)),
    smoke_fbm(position * 0.55 + vec2(8.3, 2.7) + u_time * 0.17)
  ) - 0.5;
  float field = smoke_fbm(position + warp * 2.4 + vec2(u_time * 0.12, 0.0));
  float curtain = sin((position.x + warp.x * 2.0) * 2.5 + u_time) * 0.5 + 0.5;
  curtain *= smoothstep(0.08, 0.88, field);
  float glow = pow(clamp(curtain * u_intensity, 0.0, 1.0), 1.4);
  vec4 gas = mix(u_colorB, u_colorA, field);
  vec3 rgb = mix(u_background.rgb, gas.rgb, glow * gas.a);
  float alpha = mix(u_background.a, 1.0, glow * gas.a);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = random() * 30;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          blank:
            params.background[3] <= 0 &&
            params.colorA[3] <= 0 &&
            params.colorB[3] <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
