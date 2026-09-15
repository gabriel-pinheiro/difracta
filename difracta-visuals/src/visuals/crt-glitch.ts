import { defineShaderVisual } from "@difracta/render/sdk";

export const crtGlitch = defineShaderVisual({
  id: "crt-glitch",
  name: "CRT Glitch",
  description:
    "A dying analog video signal: coloured bands under a scanline ruling, torn rows, corrupted blocks, RGB separation and a rolling bright bar.",
  notes:
    "An opaque, aggressive full-Surface texture for a break or a transition, not something to leave running behind a set. The picture is vertical Bands of colour mixed between Signal Color A and B; Bands is how many, so a low count reads as broad colour fields and a high one as a test card. Tear is the per-row horizontal shift and Glitch the block corruption, the RGB split and the grain, so the two can be run apart: Tear alone is a picture that will not hold still, Glitch alone a picture that breaks up where it stands. Either one feeds the same burst gate, so raising either makes the violent moments more frequent. Scanlines is the depth of the horizontal ruling and Scanline Pitch its spacing in physical Output pixels; below about 3 px the ruling aliases into moire that changes with every Output resolution, so keep it at 4 or more unless the moire is what you want. Speed drives the burst clock, the sheen and the rolling bar and integrates, so it can be swept live and stopped without a jump; at zero the picture freezes and costs nothing. It is opaque, so it covers whatever is under it; stack Filters on top rather than Layers. Costs one full-Surface pass per frame while moving, with three cheap band lookups per fragment.",
  parameters: {
    colorA: {
      kind: "color",
      label: "Signal Color A",
      default: [0, 1, 0.706, 1],
    },
    colorB: {
      kind: "color",
      label: "Signal Color B",
      default: [0.588, 0.235, 1, 1],
    },
    bands: {
      kind: "number",
      label: "Bands",
      default: 7,
      min: 1,
      max: 32,
      step: 1,
      description: "How many vertical colour bands the signal is split into.",
    },
    tear: {
      kind: "number",
      label: "Tear",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How far rows slide sideways out of place.",
    },
    glitch: {
      kind: "number",
      label: "Glitch",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How much of the picture breaks into corrupted blocks.",
    },
    scanlines: {
      kind: "number",
      label: "Scanlines",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    scanlinePitch: {
      kind: "number",
      label: "Scanline Pitch",
      default: 4,
      min: 2,
      max: 64,
      step: 1,
      unit: "px",
      description: "One dark-to-dark scanline cycle, in Output pixels.",
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

float crt_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

vec3 crt_signal(vec2 uv) {
  float band = floor(uv.x * max(1.0, u_bands));
  float blend = crt_hash(vec2(band, 3.0));
  vec3 bar = mix(u_colorA.rgb, u_colorB.rgb, blend);
  float sheen = 0.75 + 0.25 * sin(uv.x * 4.0 + uv.y * 7.0 + u_time * 1.3);
  return bar * sheen;
}

vec4 render_visual(vec2 uv) {
  // One shared gate: the moment the signal gives way, opened by whichever
  // of Tear and Glitch is higher, so either alone can break the picture.
  float frame_block = floor(u_time * 8.0);
  float gate = step(1.0 - max(u_tear, u_glitch) * 0.35, crt_hash(vec2(frame_block, 1.0)));

  float row = floor(uv.y * 36.0);
  float jitter = (crt_hash(vec2(row, frame_block)) - 0.5) * 2.0;
  float shift = jitter * u_tear * (0.015 + gate * 0.12);
  vec2 sampled = vec2(uv.x + shift, uv.y);

  vec2 block = floor(sampled * vec2(9.0, 13.0));
  float corrupt = step(1.0 - u_glitch * 0.12, crt_hash(block + frame_block));
  sampled.x = mix(sampled.x, fract(sampled.x + crt_hash(block) * 0.4), corrupt);

  float split = u_glitch * (0.004 + gate * 0.01);
  vec3 rgb = vec3(
    crt_signal(vec2(sampled.x - split, sampled.y)).r,
    crt_signal(sampled).g,
    crt_signal(vec2(sampled.x + split, sampled.y)).b
  );
  rgb = mix(rgb, 1.0 - rgb, corrupt * 0.6);

  float roll = fract(uv.y + u_time * 0.18);
  rgb += vec3(0.08) * exp(-roll * 9.0);

  // The ruling is spaced in Output pixels, so it reads the same at any size.
  float cycles = u_resolution.y / max(2.0, u_scanlinePitch);
  float scan = 1.0 - u_scanlines * (0.5 + 0.5 * sin(uv.y * cycles * 6.2831853)) * 0.45;
  rgb *= scan;

  rgb += (crt_hash(uv * u_resolution + u_time) - 0.5) * 0.1 * (0.4 + gate);

  vec2 centered = uv - 0.5;
  rgb *= 1.0 - dot(centered, centered) * 0.55;
  return vec4(rgb, 1.0);
}`,
  create({ random }) {
    let time = 0;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        time += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          uniforms: { time, seed },
        };
      },
    };
  },
});
