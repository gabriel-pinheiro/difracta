import { defineShaderVisual } from "@difracta/render/sdk";

export const nebula = defineShaderVisual({
  id: "nebula",
  name: "Nebula",
  description:
    "Domain-warped gas clouds drift and fold over deep space, with bright filaments where the warp doubles back and twinkling stars in front.",
  notes:
    "A very slow ambient for a large Surface, the kind of backdrop a whole set can sit in front of. Deep Space is the void and the Visual's opacity: drop its alpha and the clouds thin out over the Scene below while the stars stay. Gas Color A follows the cloud density and Gas Color B the direction of the warp, so two hues far apart separate the layers and two close ones read as one gas; Core Glow only lights the filaments, so it is worth keeping brighter than both. Cloud Scale is how many cloud structures fit across the Surface: around 2 gives one great cloud, above 5 a busy field. Star Density is literal coverage, the share of the fine star grid that holds a star, so 4% is a calm sky and anything above about 20% reads as noise; stars dim behind thick gas on their own. Drift Speed scales both the fold and the twinkle and integrates, so it can be swept live and stopped without a jump, and a stopped nebula costs nothing. Expensive: five fbm evaluations per fragment, each Detail octaves deep, so at Detail 5 that is twenty-five noise lookups on every pixel — drop Detail to 3 on a slow Output, which softens the fine structure but keeps the shapes. Detail is normalised, so changing it does not change how bright the clouds are.",
  parameters: {
    deep: {
      kind: "color",
      label: "Deep Space",
      default: [0.039, 0.031, 0.118, 1],
    },
    gasA: {
      kind: "color",
      label: "Gas Color A",
      default: [0.471, 0.157, 0.627, 1],
    },
    gasB: {
      kind: "color",
      label: "Gas Color B",
      default: [0.157, 0.549, 0.745, 1],
    },
    glow: { kind: "color", label: "Core Glow", default: [1, 0.745, 0.863, 1] },
    cloudScale: {
      kind: "number",
      label: "Cloud Scale",
      default: 2.5,
      min: 1,
      max: 8,
      step: 0.25,
    },
    starDensity: {
      kind: "number",
      label: "Star Density",
      default: 0.04,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "Share of the star grid that holds a star.",
    },
    detail: {
      kind: "number",
      label: "Detail",
      default: 5,
      min: 1,
      max: 6,
      step: 1,
      description:
        "Noise octaves per cloud evaluation; the cost of the Visual.",
    },
    speed: {
      kind: "number",
      label: "Drift Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
    },
  },
  fragment: `
uniform float u_drift;
uniform float u_twinkle;
uniform float u_seed;

float nebula_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

float nebula_noise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = nebula_hash(cell);
  float b = nebula_hash(cell + vec2(1.0, 0.0));
  float c = nebula_hash(cell + vec2(0.0, 1.0));
  float d = nebula_hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

// Normalised by the amplitude actually spent, so Detail changes the
// structure of the cloud and never its brightness.
float nebula_fbm(vec2 position) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  int octaves = int(u_detail + 0.5);
  for (int octave = 0; octave < 6; octave += 1) {
    if (octave >= octaves) break;
    value += amplitude * nebula_noise(position);
    total += amplitude;
    position = turn * position * 2.03 + 7.77;
    amplitude *= 0.5;
  }
  return value / max(total, 0.0001) * 0.96875;
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 position = (uv - 0.5) * vec2(aspect, 1.0) * u_cloudScale;

  // fbm warped by fbm warped by fbm — the classic Quilez construction.
  vec2 q = vec2(
    nebula_fbm(position + u_drift),
    nebula_fbm(position + vec2(5.2, 1.3) - u_drift)
  );
  vec2 r = vec2(
    nebula_fbm(position + 4.0 * q + vec2(1.7, 9.2) + u_drift * 2.0),
    nebula_fbm(position + 4.0 * q + vec2(8.3, 2.8))
  );
  float cloud = nebula_fbm(position + 4.0 * r);

  vec3 rgb = u_deep.rgb;
  rgb = mix(rgb, u_gasA.rgb, smoothstep(0.25, 0.75, cloud));
  rgb = mix(rgb, u_gasB.rgb, clamp(length(q) * 0.9, 0.0, 1.0) * 0.6);
  // Bright filaments where the warp folds over itself.
  float filament = smoothstep(0.5, 0.95, cloud) * smoothstep(0.9, 0.2, length(r));
  rgb += u_glow.rgb * filament * 0.5;

  // Pin-prick stars on a fine hash grid, twinkling out of phase.
  vec2 star_space = uv * vec2(aspect, 1.0) * 90.0;
  vec2 star_cell = floor(star_space);
  float star_seed = nebula_hash(star_cell);
  vec2 star_local = fract(star_space) - 0.5;
  float flicker = 0.55 + 0.45 * sin(u_twinkle * (1.0 + star_seed * 4.0) + star_seed * 40.0);
  float gate = step(1.0 - u_starDensity, star_seed);
  float star = exp(-dot(star_local, star_local) * 60.0) * gate * flicker;
  // Stars dim behind thick gas.
  star *= mix(1.0, 0.25, smoothstep(0.3, 0.8, cloud));
  rgb += vec3(1.0) * star;

  float alpha = clamp(u_deep.a * (0.55 + 0.45 * cloud) + star, 0.0, 1.0);
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let drift = 0;
    /** The stars' own clock; they blink much faster than the gas moves. */
    let twinkle = random() * 20;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        drift += dt * params.speed * 0.05;
        twinkle += dt * params.speed;
        return {
          changed: changed || params.speed > 0,
          blank: params.deep[3] <= 0 && params.starDensity <= 0,
          uniforms: { drift, twinkle, seed },
        };
      },
    };
  },
});
