import { defineShaderVisual } from "@difracta/render/sdk";

export const waterCaustics = defineShaderVisual({
  id: "water-caustics",
  name: "Water Caustics",
  description:
    "The light on the bottom of a pool: a flowing web of bright caustic lines over a water color, darker toward the bottom.",
  notes:
    "An opaque, calm ambient that turns a wall into a pool floor. Water Color is the ground and Light Color the caustic web; a Light Color with lower alpha dims the web without changing the water. Scale is how many cells fit across the Surface; around 3 reads as a pool from a distance, above 6 as a close-up ripple. Speed integrates, so it can be swept live and stopped without a jump, and a stopped pattern costs nothing. Dispersion offsets the red, green and blue webs slightly for a chromatic fringe; at zero the web is evaluated once, so it is also cheaper. Depth Shade darkens the water toward the bottom edge, as if the pool got deeper; zero is flat. The pattern is seeded per Layer, so two Surfaces never show the same web. Costs one full-Surface pass per frame while moving, about three times that with Dispersion above zero.",
  parameters: {
    water: {
      kind: "color",
      label: "Water Color",
      default: [0.024, 0.141, 0.227, 1],
    },
    light: {
      kind: "color",
      label: "Light Color",
      default: [0.667, 0.902, 1, 1],
    },
    scale: {
      kind: "number",
      label: "Scale",
      default: 3,
      min: 0.5,
      max: 10,
      step: 0.1,
    },
    speed: {
      kind: "number",
      label: "Speed",
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.02,
    },
    dispersion: {
      kind: "number",
      label: "Dispersion",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
    },
    depthShade: {
      kind: "number",
      label: "Depth Shade",
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      percent: true,
      description: "How much darker the water gets toward the bottom edge.",
    },
  },
  fragment: `
uniform float u_time;
uniform float u_seed;

float caustics_field(vec2 position, float time) {
  vec2 warped = position;
  float total = 1.0;
  for (int octave = 0; octave < 5; octave += 1) {
    float phase = time * (1.0 - 3.5 / float(octave + 1));
    warped = position + vec2(
      cos(phase - warped.x) + sin(phase + warped.y),
      sin(phase - warped.y) + cos(phase + warped.x)
    );
    total += 1.0 / length(vec2(
      position.x / (sin(warped.x + phase) * 200.0),
      position.y / (cos(warped.y + phase) * 200.0)
    ));
  }
  total /= 5.0;
  total = 1.17 - pow(total, 1.4);
  return pow(abs(total), 8.0);
}

vec4 render_visual(vec2 uv) {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  // The field's brightness depends on the magnitude of position, tuned around
  // -250, so the seed moves the pattern in time only and every Layer is as lit.
  vec2 position = uv * vec2(aspect, 1.0) * u_scale - 250.0;
  float time = u_time + u_seed * 40.0;
  vec3 light;
  if (u_dispersion <= 0.0) {
    light = vec3(caustics_field(position, time));
  } else {
    float offset = u_dispersion * 0.12;
    light = vec3(
      caustics_field(position, time),
      caustics_field(position + vec2(offset, 0.0), time + offset),
      caustics_field(position + vec2(0.0, offset), time + offset * 2.0)
    );
  }
  float depth_shade = 1.0 - uv.y * u_depthShade;
  vec3 rgb = u_water.rgb * depth_shade + u_light.rgb * light * u_light.a;
  float luminance = max(light.r, max(light.g, light.b));
  float alpha = max(u_water.a, clamp(luminance, 0.0, 1.0));
  return vec4(rgb, alpha);
}`,
  create({ random }) {
    let time = 0;
    // The golden ratio spreads Layer seeds apart, so nearby seeds do not look alike.
    const seed = Math.floor(random() * 1024) * 0.61803;
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
