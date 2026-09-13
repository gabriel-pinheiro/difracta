import { defineShaderVisual } from "@difracta/render/sdk";

export const starField = defineShaderVisual({
  id: "star-field",
  name: "Star Field",
  description:
    "Three depths of shimmering stars are born, twinkle and fade over a Lifetime while the whole sky drifts slowly.",
  notes:
    "A transparent night sky for a ceiling or a dark wall: far stars are small and dim, near ones larger and brighter, and each lives one Lifetime from fade-in to fade-out before another appears somewhere else, so the field never repeats. Density is how many stars are in the sky at once; Minimum and Maximum Size bound them in pixels, so a distant Surface wants a larger minimum. Speed scales both the life cycle and the Drift, which is how fast the sky slides, near stars faster than far ones. Everything integrates, so Lifetime, Speed and Drift can be swept live without stars jumping. Brightness above 1 pushes the tint toward white for a harder sparkle. Color tints the stars; with Additive blend mode they light what is below. Costs one full-Surface pass per frame while Speed is above zero, with three layers evaluated per pixel.",
  parameters: {
    color: { kind: "color", label: "Color", default: [1, 1, 1, 1] },
    brightness: {
      kind: "number",
      label: "Brightness",
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
    },
    density: {
      kind: "number",
      label: "Density",
      default: 90,
      min: 8,
      max: 300,
      step: 1,
    },
    lifetime: {
      kind: "number",
      label: "Lifetime",
      default: 5,
      min: 0.5,
      max: 20,
      step: 0.1,
      unit: "s",
    },
    minimumSize: {
      kind: "number",
      label: "Minimum Size",
      default: 1,
      min: 0.25,
      max: 8,
      step: 0.05,
      unit: "px",
    },
    maximumSize: {
      kind: "number",
      label: "Maximum Size",
      default: 3.5,
      min: 0.5,
      max: 14,
      step: 0.1,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
      unit: "x",
    },
    drift: {
      kind: "number",
      label: "Drift",
      default: 4,
      min: 0,
      max: 30,
      step: 0.5,
      unit: "px/s",
    },
  },
  fragment: `
uniform float u_cycle;
// How far the nearest layer has slid, in pixels; Drift itself is the rate.
uniform float u_slide;
uniform float u_seed;

float star_hash(vec2 value, float channel) {
  vec3 seed = vec3(value, channel + u_seed);
  seed = fract(seed * vec3(0.1031, 0.1030, 0.0973));
  seed += dot(seed, seed.yzx + 33.33);
  return fract((seed.x + seed.y) * seed.z);
}

float star_envelope(float progress) {
  return smoothstep(0.0, 0.18, progress) * (1.0 - smoothstep(0.72, 1.0, progress));
}

// Where in its life a star is: the shared cycle counts lifetimes, and each
// star lives a little longer or shorter and starts its own way through.
float star_cycle(vec2 cell, float channel, out float generation) {
  float variation = mix(0.8, 1.2, star_hash(cell, channel));
  float cycle = u_cycle / variation + star_hash(cell, channel + 1.0);
  generation = floor(cycle);
  return fract(cycle);
}

vec4 star_layer(vec2 uv, float layer, float density_scale) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  float density = max(2.0, u_density * density_scale);
  vec2 grid = vec2(max(1.0, ceil(sqrt(density * aspect))), max(1.0, ceil(sqrt(density / aspect))));
  float depth = mix(0.35, 1.0, layer / 2.0);
  vec2 drift = vec2(0.73, -0.41) * u_slide * depth / max(vec2(1.0), u_resolution);
  vec2 grid_position = (uv + drift) * grid;
  vec2 cell = floor(grid_position);
  float generation;
  float progress = star_cycle(cell, 30.0 + layer * 10.0, generation);
  vec2 position = vec2(
    mix(0.18, 0.82, star_hash(cell + generation, 33.0 + layer)),
    mix(0.18, 0.82, star_hash(cell + generation, 36.0 + layer))
  );
  vec2 delta = (fract(grid_position) - position) * (u_resolution / grid);
  float smallest = min(u_minimumSize, u_maximumSize);
  float largest = max(u_minimumSize, u_maximumSize);
  float size = mix(smallest, largest, star_hash(cell + generation, 39.0 + layer)) * mix(0.45, 1.0, depth);
  float point = 1.0 - smoothstep(size * 0.2, size, length(delta));
  float shimmer = 0.75 + 0.25 * sin(progress * 12.5663706 + star_hash(cell, 42.0 + layer) * 6.2831853);
  float alpha = point * star_envelope(progress) * shimmer * depth;
  vec3 tint = mix(u_color.rgb, vec3(1.0), star_hash(cell + generation, 45.0 + layer) * 0.35);
  return vec4(tint * u_brightness, u_color.a * alpha);
}

vec4 render_visual(vec2 uv) {
  vec4 far = star_layer(uv, 0.0, 0.5);
  vec4 middle = star_layer(uv, 1.0, 0.3);
  vec4 near = star_layer(uv, 2.0, 0.2);
  vec3 rgb = far.rgb * far.a + middle.rgb * middle.a + near.rgb * near.a;
  float alpha = 1.0 - (1.0 - far.a) * (1.0 - middle.a) * (1.0 - near.a);
  return vec4(rgb / max(alpha, 0.0001), alpha);
}`,
  create({ random }) {
    /** Lifetimes elapsed; a star's own cycle is derived from this. */
    let cycle = random() * 8;
    /** How far the nearest layer has slid, in pixels. */
    let slide = 0;
    const seed = Math.floor(random() * 65521);
    return {
      update({ dt, params, changed }) {
        cycle += (dt * params.speed) / params.lifetime;
        slide += dt * params.speed * params.drift;
        return {
          changed: changed || params.speed > 0,
          blank: params.color[3] <= 0 || params.brightness <= 0,
          uniforms: { cycle, slide, seed },
        };
      },
    };
  },
});
