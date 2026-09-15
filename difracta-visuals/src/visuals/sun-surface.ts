import { defineShaderVisual } from "@difracta/render/sdk";

export const sunSurface = defineShaderVisual({
  id: "sun-surface",
  name: "Sun Surface",
  description:
    "Solar granulation seen close up: convection cells boil and slide past each other, dark channels between them and hot ridges along their crests.",
  notes:
    "A hot, opaque material that fills a Surface edge to edge with no composition of its own, so it works as a wall, a floor or the inside of a shape. Base Color is the cold channel between cells, Body Color the cell floor and Hot Color the ridge crests, and the three read as one material only if they climb in brightness in that order. Contrast is how sharply the picture crosses between them: below 1 it is a soft orange haze, above 2 the ridges snap into hard bright veins. Scale is how many cells fit across the Surface — around 4 reads as a close-up sun, above 10 as fine sand. Turbulence is how far the cells are dragged out of shape by the slow underlying flow; at zero they sit in a regular boil, at 3 they smear into currents. Speed integrates, so it can be swept live and stopped without a jump, and a stopped surface costs nothing; it is a slow Visual, and above about 1 it reads as fire rather than as a star. Expensive: four five-octave fbm evaluations per fragment, so twenty noise lookups on every pixel of the Surface. The colors carry their own alpha, so lowering all three fades the whole picture into the Scene below.",
  parameters: {
    base: {
      kind: "color",
      label: "Base Color",
      default: [0.361, 0.078, 0.008, 1],
    },
    body: { kind: "color", label: "Body Color", default: [1, 0.518, 0.047, 1] },
    hot: { kind: "color", label: "Hot Color", default: [1, 0.957, 0.667, 1] },
    contrast: {
      kind: "number",
      label: "Contrast",
      default: 1.35,
      min: 0.4,
      max: 3,
      step: 0.05,
    },
    scale: {
      kind: "number",
      label: "Scale",
      default: 4,
      min: 0.5,
      max: 14,
      step: 0.1,
    },
    turbulence: {
      kind: "number",
      label: "Turbulence",
      default: 1.4,
      min: 0,
      max: 4,
      step: 0.05,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.3,
      min: 0,
      max: 3,
      step: 0.05,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float sun_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float sun_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = sun_hash(cell);
  float b = sun_hash(cell + vec2(1.0, 0.0));
  float c = sun_hash(cell + vec2(0.0, 1.0));
  float d = sun_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float sun_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 5; octave += 1) {
    value += amplitude * sun_noise(position);
    position = turn * position * 2.03 + 17.17;
    amplitude *= 0.5;
  }
  return value;
}

vec4 sun_palette(float value) {
  float contrasted = clamp((value - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  vec4 low = mix(u_base, u_body, smoothstep(0.0, 0.58, contrasted));
  return mix(low, u_hot, smoothstep(0.52, 1.0, contrasted));
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0) * u_scale;
  vec2 warp = vec2(
    sun_fbm(position * 0.72 + vec2(u_time * 0.11, -u_time * 0.08)),
    sun_fbm(position * 0.72 + vec2(13.7, 4.1) + u_time * 0.09)
  ) - 0.5;
  float broad = sun_fbm(position + warp * u_turbulence + vec2(u_time * 0.08, u_time * 0.04));
  float granules = sun_fbm(position * 3.4 - warp * 1.7 - vec2(u_time * 0.16, -u_time * 0.1));
  float ridges = 1.0 - abs(granules * 2.0 - 1.0);
  float surface = clamp(broad * 0.62 + ridges * 0.58 - 0.12, 0.0, 1.0);
  return sun_palette(surface);
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
            params.base[3] <= 0 && params.body[3] <= 0 && params.hot[3] <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
