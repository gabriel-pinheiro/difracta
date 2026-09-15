import { defineShaderVisual } from "@difracta/render/sdk";

/** The fragment's loop cap, and so the most raymarch steps a Layer can ask for. */
const MAX_STEPS = 96;

export const neonLattice = defineShaderVisual({
  id: "neon-lattice",
  name: "Neon Lattice",
  description:
    "A raymarched grid of glowing tubes recedes into depth and flies toward the viewer, rolling slowly as it goes.",
  notes:
    "The one Visual here with real depth: a three-dimensional lattice of luminous tubes is marched through, so near tubes are fat and bright, far ones converge to a vanishing point, and the whole tunnel banks gently as it flies. Lattice Density is how tightly the grid is packed and so how far away the vanishing point feels; low values give a few big beams to hang a Surface on, high values a dense mesh that reads as a solid glowing block. Tube Thickness is the width of the glow around each tube, from hairlines that sparkle against the dark to soft bars that bleed into each other and wash the Surface out. Color A and Color B are mixed by depth oscillation rather than by distance, so the tunnel bands along its length between the two; near-complementary pairs read as neon signage, close pairs as one material. Raymarch Steps is the cost control and the only one: every step is another sample per pixel, so drop it toward the low end on a weak Output or a large Surface and the tunnel goes dimmer and shallower rather than breaking. Flight Speed integrates, so it can be swept live and stopped without a jump, and a stopped lattice costs nothing. The most expensive Visual here by a wide margin; give it a Surface of its own rather than stacking it. Costs one full-Surface pass of Raymarch Steps samples per frame while flying.",
  parameters: {
    background: {
      kind: "color",
      label: "Background",
      default: [0.004, 0.008, 0.035, 1],
    },
    colorA: { kind: "color", label: "Color A", default: [0.165, 0.878, 1, 1] },
    colorB: { kind: "color", label: "Color B", default: [1, 0.196, 0.592, 1] },
    density: {
      kind: "number",
      label: "Lattice Density",
      default: 2.4,
      min: 1.2,
      max: 5,
      step: 0.1,
    },
    thickness: {
      kind: "number",
      label: "Tube Thickness",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How wide the glow around each tube spreads.",
    },
    speed: {
      kind: "number",
      label: "Flight Speed",
      default: 0.22,
      min: 0,
      max: 2,
      step: 0.02,
    },
    steps: {
      kind: "number",
      label: "Raymarch Steps",
      default: 52,
      min: 8,
      max: MAX_STEPS,
      step: 4,
      description: "Samples per pixel; lower is cheaper, dimmer and shallower.",
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

mat2 lattice_turn(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 screen = (uv - 0.5) * vec2(aspect, 1.0);
  vec3 origin = vec3(0.0, 0.0, -2.8 + u_time);
  vec3 ray = normalize(vec3(screen, 1.15));
  ray.xy = lattice_turn(sin(u_time * 0.17 + u_seed) * 0.28) * ray.xy;
  float falloff = mix(110.0, 14.0, u_thickness);
  float travel = 0.0;
  vec3 accumulated = vec3(0.0);
  float total = 0.0;
  for (int index = 0; index < ${String(MAX_STEPS)}; index += 1) {
    if (float(index) >= u_steps) break;
    vec3 position = origin + ray * travel;
    position.xy = lattice_turn(position.z * 0.08 + u_time * 0.12) * position.xy;
    vec3 repeated = mod(position * u_density + 0.5, 1.0) - 0.5;
    float tubes = min(length(repeated.xy), min(length(repeated.yz), length(repeated.xz)));
    float distanceToTube = max(0.004, tubes / u_density - 0.018);
    float glow = exp(-distanceToTube * falloff) / (1.0 + travel * 0.08);
    float blend = 0.5 + 0.5 * sin(position.z * 0.23 + u_seed * 6.2831853);
    float tint = mix(u_colorA.a, u_colorB.a, blend);
    accumulated += mix(u_colorA.rgb, u_colorB.rgb, blend) * glow * tint * 0.055;
    total += glow * tint * 0.035;
    travel += clamp(distanceToTube * 0.72, 0.012, 0.18);
  }
  vec3 rgb = u_background.rgb + accumulated;
  return vec4(rgb, max(u_background.a, clamp(total, 0.0, 1.0)));
}`,
  create({ random }) {
    // The flight travels forward for good, so the clock is not wrapped.
    let time = random() * 60;
    const seed = random();
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
