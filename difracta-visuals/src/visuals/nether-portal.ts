import { defineShaderVisual } from "@difracta/render/sdk";

export const netherPortal = defineShaderVisual({
  id: "nether-portal",
  name: "Nether Portal",
  description:
    "A deliberately blocky violet portal: quantized currents cross each other, luminous rifts open where they fold, and sparks flick on and off.",
  notes:
    "A dense, near-opaque field for a doorway-shaped Surface or anything meant to read as a way through. Pixel Size is the block the whole picture is quantized to, in Output pixels, so it holds the same chunky look on a small Surface and a large one; Levels is how many flat shades the currents are posterised into, and the two together are what make it read as a game texture rather than a gradient — Levels above about 10 loses that and reads as smoke. Shadow is the low value, Portal the high one, and Glow lights both the rifts and the sparks, so it wants to be the brightest of the three. Distortion bends the currents around each other; at zero they slide flat, past about 2 they knot. Sparks is the share of blocks that flash at once, and each spark fades in and out over its own life. Speed drives the currents and the spark clock and integrates, so it can be swept live and stopped without a jump; at zero the portal freezes and costs nothing. Moderately expensive: three four-octave fbm evaluations per fragment, though the block quantization means neighbouring pixels do identical work. The colors carry their own alpha, so it layers over a Scene without a Blend mode change.",
  parameters: {
    shadow: {
      kind: "color",
      label: "Shadow Color",
      default: [0.106, 0.008, 0.176, 0.922],
    },
    portal: {
      kind: "color",
      label: "Portal Color",
      default: [0.435, 0.094, 0.745, 0.961],
    },
    glow: { kind: "color", label: "Glow Color", default: [0.886, 0.314, 1, 1] },
    pixelSize: {
      kind: "number",
      label: "Pixel Size",
      default: 6,
      min: 1,
      max: 32,
      step: 1,
      unit: "px",
    },
    levels: {
      kind: "number",
      label: "Levels",
      default: 7,
      min: 2,
      max: 16,
      step: 1,
      description: "How many flat shades the currents are posterised into.",
    },
    distortion: {
      kind: "number",
      label: "Distortion",
      default: 1.15,
      min: 0,
      max: 3,
      step: 0.05,
    },
    sparks: {
      kind: "number",
      label: "Sparks",
      default: 0.015,
      min: 0,
      max: 0.2,
      step: 0.005,
      percent: true,
      description: "Share of blocks flashing at once.",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.7,
      min: 0,
      max: 3,
      step: 0.05,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float portal_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float portal_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = portal_hash(cell);
  float b = portal_hash(cell + vec2(1.0, 0.0));
  float c = portal_hash(cell + vec2(0.0, 1.0));
  float d = portal_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float portal_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 4; octave += 1) {
    value += amplitude * portal_noise(position);
    position = turn * position * 2.03 + 13.71;
    amplitude *= 0.5;
  }
  return value;
}

vec4 render_visual(vec2 uv) {
  // Quantizing screen-space coordinates keeps the portal deliberately blocky
  // while letting Pixel Size stay consistent across Surface proportions.
  vec2 pixel = floor(uv * u_resolution / max(1.0, u_pixelSize));
  float offset = u_seed * 0.0013;

  float broad = portal_fbm(
    pixel * vec2(0.035, 0.024) + vec2(u_time * 0.08, -u_time * 0.16 + offset)
  );
  vec2 warp = vec2(
    sin(pixel.y * 0.055 + broad * 6.0 + u_time * 0.75),
    cos(pixel.x * 0.045 - broad * 5.0 - u_time * 0.55)
  ) * (5.5 * u_distortion);

  vec2 current_position = pixel + warp;
  float rising = portal_fbm(
    current_position * vec2(0.072, 0.052) + vec2(-u_time * 0.18, u_time * 0.62)
  );
  float crossing = portal_fbm(
    current_position.yx * vec2(0.05, 0.085) + vec2(u_time * 0.31, offset)
  );
  float current = rising * 0.58 + crossing * 0.42;

  float folded = 1.0 - abs(current * 2.0 - 1.0);
  float rifts = pow(clamp(folded, 0.0, 1.0), 3.2);
  float value = clamp(current * 0.78 + broad * 0.3, 0.0, 1.0);
  // A small number of flat bands echoes a limited-value portal texture.
  float bands = max(2.0, floor(u_levels + 0.5));
  value = clamp(floor(value * bands) / (bands - 1.0), 0.0, 1.0);

  vec4 base = mix(u_shadow, u_portal, value);
  vec4 color = mix(base, u_glow, rifts * 0.58);

  vec2 spark_cell = floor(pixel / 3.0);
  float spark_tick = floor(u_time * 8.0);
  float spark = step(1.0 - u_sparks, portal_hash(spark_cell + vec2(0.0, spark_tick * 1.7)));
  float spark_phase = fract(portal_hash(spark_cell + 23.4) + u_time * 0.9);
  spark *= smoothstep(0.0, 0.18, spark_phase) * (1.0 - smoothstep(0.55, 1.0, spark_phase));
  color = mix(color, u_glow, spark * 0.72);

  return color;
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
            params.shadow[3] <= 0 &&
            params.portal[3] <= 0 &&
            params.glow[3] <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
