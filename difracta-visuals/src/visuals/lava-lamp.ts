import { defineShaderVisual } from "@difracta/render/sdk";

export const lavaLamp = defineShaderVisual({
  id: "lava-lamp",
  name: "Lava Lamp",
  description:
    "Soft metaball blobs rise, fall and merge over a graded background, each with a bright core and a glowing rim.",
  notes:
    "A slow, opaque ambient that suits a tall Surface best, because the blobs travel up and down their own lanes: on a wide Surface they read as a row of lamps instead of one. Blobs is how many are in the jar and Blob Size their radius as a share of the Surface height, so many large blobs merge into one restless mass and few small ones stay separate — the pair is what decides whether it reads as lava or as bubbles. Core Color fills the middle of a blob and Glow Color its edge, its rim halo and the tint the background picks up near the bottom; Glow Color's alpha fades the blobs into the background without touching it. Background is the jar behind them, brighter toward the bottom. Speed integrates, so it can be swept live and stopped without a jump, and a stopped lamp costs nothing. Cheap for what it looks like: no noise at all, just up to ten inverse-square field terms per fragment, so cost rises with Blobs and nothing else.",
  parameters: {
    core: { kind: "color", label: "Core Color", default: [1, 0.329, 0.157, 1] },
    glow: { kind: "color", label: "Glow Color", default: [1, 0.667, 0.235, 1] },
    background: {
      kind: "color",
      label: "Background",
      default: [0.11, 0.031, 0.157, 1],
    },
    blobs: {
      kind: "number",
      label: "Blobs",
      default: 6,
      min: 2,
      max: 10,
      step: 1,
    },
    size: {
      kind: "number",
      label: "Blob Size",
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "Blob radius as a share of the Surface height.",
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

float lava_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0);
  // Blob Size is a share of the Surface height; 40% of it is the widest blob.
  float radius_scale = u_size * 0.4;
  int count = int(u_blobs + 0.5);
  float field = 0.0;
  for (int index = 0; index < 10; index += 1) {
    if (index >= count) break;
    float order = float(index);
    float drift = lava_hash(vec2(order, 1.7));
    float phase = lava_hash(vec2(order, 9.2));
    float lane = lava_hash(vec2(order, 23.5));
    float wobble = u_time * (0.35 + drift * 0.4) + phase * 6.28318;
    vec2 center = vec2(
      (lane - 0.5) * 0.7 * aspect + sin(wobble * 0.63) * 0.16,
      sin(wobble) * (0.34 + drift * 0.12)
    );
    float radius = radius_scale * (0.55 + phase * 0.9);
    vec2 delta = position - center;
    delta.y *= 0.82;
    field += (radius * radius) / max(dot(delta, delta), 0.00004);
  }
  float edge = fwidth(field) * 1.5 + 0.04;
  float body = smoothstep(1.0 - edge, 1.0 + edge, field);
  float core = smoothstep(1.6, 3.2, field);
  float rim = smoothstep(0.55, 1.0, field) * (1.0 - body);
  vec3 blob = mix(u_glow.rgb, u_core.rgb, core);
  vec3 background = u_background.rgb * (0.55 + 0.45 * (1.0 - uv.y)) +
    u_glow.rgb * 0.1 * (1.0 - uv.y);
  vec3 rgb = mix(background, blob, body * u_glow.a) + u_glow.rgb * rim * 0.35;
  float alpha = max(u_background.a, body);
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
          blank: params.background[3] <= 0 && params.size <= 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
