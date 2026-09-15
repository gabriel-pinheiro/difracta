import { defineShaderVisual } from "@difracta/render/sdk";

export const plasmaTurbulence = defineShaderVisual({
  id: "plasma-turbulence",
  name: "Plasma Turbulence",
  description:
    "A storm of warped plasma: fields folded through each other into churning cells, with thin hot filaments burning along the folds.",
  notes:
    "A churning, opaque field for a big Surface — it has no features of its own, so it reads as material rather than as a picture. Hot Color lights the filaments and Cool Color the body of the storm; Background shows where nothing is burning and its alpha is the Visual's floor opacity, so dropping it lets the Scene through between the filaments. Scale is how many cells fit across the Surface: below 3 a few slow masses, above 7 a fine boil. Intensity is a contrast multiplier on the whole field and also brightens the filaments a second time, so past about 2 it clips to a flat hot sheet — pair a high Intensity with a low Scale, or the other way round. Storm Speed integrates, so it can be swept live and stopped without a jump, and a stopped storm costs nothing. The heaviest Visual in the set: four fbm evaluations per fragment, each Detail octaves deep, so at Detail 6 that is twenty-four noise lookups on every pixel of the Surface. Drop Detail to 4 on a slow Output or a large Surface; it softens the smallest curls and nothing else, because Detail is normalised and does not change the brightness. Stack a Filter over it rather than another Layer.",
  parameters: {
    background: {
      kind: "color",
      label: "Background",
      default: [0.012, 0, 0.047, 1],
    },
    colorA: {
      kind: "color",
      label: "Hot Color",
      default: [1, 0.184, 0.114, 1],
    },
    colorB: {
      kind: "color",
      label: "Cool Color",
      default: [0.302, 0.224, 1, 1],
    },
    intensity: {
      kind: "number",
      label: "Intensity",
      default: 1.45,
      min: 0.3,
      max: 3,
      step: 0.05,
    },
    scale: {
      kind: "number",
      label: "Scale",
      default: 4.2,
      min: 1,
      max: 10,
      step: 0.1,
    },
    detail: {
      kind: "number",
      label: "Detail",
      default: 6,
      min: 1,
      max: 6,
      step: 1,
      description:
        "Noise octaves per field evaluation; the cost of the Visual.",
    },
    speed: {
      kind: "number",
      label: "Storm Speed",
      default: 0.2,
      min: 0,
      max: 2,
      step: 0.02,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float plasma_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float plasma_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = plasma_hash(cell);
  float b = plasma_hash(cell + vec2(1.0, 0.0));
  float c = plasma_hash(cell + vec2(0.0, 1.0));
  float d = plasma_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

// Normalised by the amplitude actually spent, so Detail changes the
// structure of the storm and never its brightness.
float plasma_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.52;
  float total = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  int octaves = int(u_detail + 0.5);
  for (int octave = 0; octave < 6; octave += 1) {
    if (octave >= octaves) break;
    value += amplitude * plasma_noise(position);
    total += amplitude;
    position = turn * position * 2.03 + 17.41;
    amplitude *= 0.5;
  }
  return value / max(total, 0.0001) * 1.02375;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0) * u_scale;
  float offset = u_seed * 0.00014;
  vec2 warpA = vec2(
    plasma_fbm(position * 0.72 + vec2(u_time, offset)),
    plasma_fbm(position * 0.72 + vec2(offset, -u_time))
  ) - 0.5;
  vec2 warpB = vec2(
    plasma_fbm(position + warpA * 2.8 + vec2(-u_time * 0.4, 2.7)),
    plasma_fbm(position + warpA.yx * 2.8 + vec2(8.1, u_time * 0.35))
  ) - 0.5;
  float turbulence = length(warpB) * 1.6;
  float filaments = pow(
    clamp(1.0 - abs(sin((warpA.x + warpB.y) * 13.0 + u_time * 2.0)), 0.0, 1.0),
    3.0
  );
  float energy = clamp((turbulence * 0.8 + filaments) * u_intensity, 0.0, 1.0);
  vec4 tint = mix(u_colorB, u_colorA, filaments);
  vec3 rgb = mix(u_background.rgb, tint.rgb, energy);
  rgb += tint.rgb * filaments * u_intensity * 0.42;
  float alpha = max(u_background.a, energy * tint.a);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = 0;
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
