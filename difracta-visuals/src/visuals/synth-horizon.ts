import { defineShaderVisual } from "@difracta/render/sdk";

export const synthHorizon = defineShaderVisual({
  id: "synth-horizon",
  name: "Synth Horizon",
  description:
    "A retro-futurist landscape: a perspective grid scrolls toward the viewer under a striped sun, a star field above and a glowing line where they meet.",
  notes:
    "The one Visual in this set with a composition, so it wants a Surface the right way up and roughly 16:9; on a tall Surface the grid takes over and the sky closes in. Horizon is where the ground starts, as a share of the Surface height from the top, and everything else is placed from it: the sun sits just above it and the glow burns along it. Grid Scale is the density of the perspective grid, low for a few wide lanes and high for a fine mesh, and it reads best when the lanes are wider than the scanline of the Output. Sun Size is the radius as a share of the Surface height, and Sun Stripes the horizontal banding cut out of it — the bands widen toward the bottom of the sun on their own, so a small sun wants fewer stripes. Sun Top and Sun Bottom shade the sun from crest to base; Grid Color also lights the horizon glow, and Sky Color grades the sky and darkens the ground. Stars is the share of the sky grid that holds a star, and they fade out toward the horizon. Speed drives the grid's approach and the twinkle and integrates, so it can be swept live and stopped without a jump; at zero the scene freezes and costs nothing. Cheap: no noise at all, just a hash grid and some fwidth-antialiased lines. It is opaque, so it belongs at the bottom of a Scene.",
  parameters: {
    grid: { kind: "color", label: "Grid Color", default: [1, 0.243, 0.784, 1] },
    sky: {
      kind: "color",
      label: "Sky Color",
      default: [0.063, 0.031, 0.188, 1],
    },
    sunTop: { kind: "color", label: "Sun Top", default: [1, 0.878, 0.376, 1] },
    sunBottom: {
      kind: "color",
      label: "Sun Bottom",
      default: [1, 0.251, 0.627, 1],
    },
    horizon: {
      kind: "number",
      label: "Horizon",
      default: 0.55,
      min: 0.2,
      max: 0.8,
      step: 0.01,
      percent: true,
    },
    sunSize: {
      kind: "number",
      label: "Sun Size",
      default: 0.13,
      min: 0.02,
      max: 0.4,
      step: 0.01,
      percent: true,
      description: "Sun radius as a share of the Surface height.",
    },
    stripes: {
      kind: "number",
      label: "Sun Stripes",
      default: 38,
      min: 4,
      max: 120,
      step: 1,
    },
    stars: {
      kind: "number",
      label: "Stars",
      default: 0.005,
      min: 0,
      max: 0.1,
      step: 0.005,
      percent: true,
      description: "Share of the sky grid that holds a star.",
    },
    gridScale: {
      kind: "number",
      label: "Grid Scale",
      default: 1,
      min: 0.25,
      max: 4,
      step: 0.05,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.8,
      min: 0,
      max: 3,
      step: 0.05,
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float synth_hash(vec2 value) {
  vec3 seeded = vec3(value, u_seed);
  seeded = fract(seeded * vec3(0.1031, 0.1030, 0.0973));
  seeded += dot(seeded, seeded.yzx + 33.33);
  return fract((seeded.x + seeded.y) * seeded.z);
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  float horizon = u_horizon;
  float x = (uv.x - 0.5) * aspect;
  float ground_mask = step(horizon, uv.y);

  // Ground: perspective grid scrolling toward the viewer.
  float depth = max(uv.y - horizon, 0.001);
  float lane = x * (0.35 * u_gridScale / depth);
  float run = 0.18 * u_gridScale / depth + u_time * 2.0;
  float line_lane = abs(fract(lane + 0.5) - 0.5);
  float line_run = abs(fract(run + 0.5) - 0.5);
  float width_lane = max(fwidth(lane) * 1.2, 0.00001);
  float width_run = max(fwidth(run) * 1.2, 0.00001);
  float mesh = max(
    1.0 - smoothstep(0.0, width_lane, line_lane),
    1.0 - smoothstep(0.0, width_run, line_run)
  );
  mesh *= smoothstep(0.0, 0.05, depth);
  vec3 ground = u_sky.rgb * 0.25 + u_grid.rgb * mesh * u_grid.a;

  // Sky: gradient, stars, and a striped retro sun.
  float sky_amount = clamp(uv.y / max(horizon, 0.001), 0.0, 1.0);
  vec3 sky = mix(
    u_sky.rgb,
    u_sky.rgb * 0.4 + u_sunBottom.rgb * 0.3,
    pow(sky_amount, 2.4)
  );
  vec2 star_cell = floor(vec2(x, uv.y) * 70.0);
  float star = step(1.0 - u_stars, synth_hash(star_cell));
  float twinkle = 0.5 + 0.5 * sin(u_time * 3.0 + synth_hash(star_cell + 4.7) * 6.28318);
  sky += vec3(star * twinkle * (1.0 - sky_amount) * 0.8);

  // The sun rests just clear of the horizon, so it scales with Sun Size.
  vec2 center = vec2(0.0, horizon - u_sunSize * 1.4);
  float radius = max(0.001, u_sunSize);
  float sun = smoothstep(radius, radius - 0.005, length(vec2(x, uv.y) - center));
  float stripe_phase = fract(uv.y * u_stripes);
  float gap = clamp((uv.y - center.y) / radius * 0.65, 0.0, 0.55);
  sun *= step(gap, stripe_phase);
  vec3 sun_color = mix(
    u_sunTop.rgb,
    u_sunBottom.rgb,
    clamp((uv.y - center.y) / radius * 0.5 + 0.5, 0.0, 1.0)
  );
  sky = mix(sky, sun_color, sun);

  vec3 rgb = mix(sky, ground, ground_mask);
  rgb += u_grid.rgb * exp(-abs(uv.y - horizon) * 24.0) * 0.5;
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
