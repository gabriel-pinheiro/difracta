import { defineShaderVisual } from "@difracta/render/sdk";

/** The most Acceleration can multiply Spin and Pull by, however long it is held. */
const MAX_BOOST = 4;

export const vortex = defineShaderVisual({
  id: "vortex",
  name: "Vortex",
  description:
    "Spiral arms in two colors spin around the centre while the rings cut across them crawl inward, faster the longer it is held.",
  notes:
    "Built to be held on a pad for a build or a drop: a hypnotic, full-Surface whirl from the first frame. Arms is how many spiral arms there are, always even so Colors A and B alternate; Twist bends them from straight spokes at zero into a tight coil, negative twisting the other way. Rings cuts the arms across into a warped checkerboard whose cells crawl into the centre at Pull; at 1 the cells are about square, at zero the arms are unbroken and Pull does nothing. Thickness is how much of each arm is filled, so below 100% the gaps between arms are transparent and show what is below. Spin is turns per second, negative the other way; Spin and Pull integrate, so faders can ride them without a jump, and a Vortex with both at zero is still and costs nothing. Acceleration speeds both up the longer the pad is held, by that share every second, up to four times; every press starts again from the set speeds. Toward the centre, where the spiral gets finer than a pixel, it fades out rather than shimmering. Costs one full-Surface pass per frame while moving. Stack Strobe or Blink over it in Additive for the drop, or run it inward on the build and cut to Zoom Rush outward.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [0.62, 0.12, 1, 1] },
    colorB: { kind: "color", label: "Color B", default: [0, 0.95, 0.85, 1] },
    arms: {
      kind: "number",
      label: "Arms",
      default: 8,
      min: 2,
      max: 24,
      step: 2,
    },
    twist: {
      kind: "number",
      label: "Twist",
      default: 1.5,
      min: -4,
      max: 4,
      step: 0.1,
      description: "How tightly the arms coil; zero is straight spokes.",
    },
    rings: {
      kind: "number",
      label: "Rings",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      description: "Cuts across the arms; 1 makes square cells, zero none.",
    },
    thickness: {
      kind: "number",
      label: "Thickness",
      default: 1,
      min: 0.1,
      max: 1,
      step: 0.01,
      percent: true,
      description: "How much of each arm is filled.",
    },
    spin: {
      kind: "number",
      label: "Spin",
      default: 0.25,
      min: -3,
      max: 3,
      step: 0.05,
      unit: "turns/s",
    },
    pull: {
      kind: "number",
      label: "Pull",
      default: 1.5,
      min: 0,
      max: 8,
      step: 0.1,
      unit: "x",
      description: "How fast the rings crawl inward.",
    },
    acceleration: {
      kind: "number",
      label: "Acceleration",
      default: 0,
      min: 0,
      max: 2,
      step: 0.05,
      unit: "x/s",
      description:
        "How much faster it turns and pulls each second it is held, up to 4x.",
    },
  },
  fragment: `
uniform float u_turn;
uniform float u_crawl;

const float PI = 3.14159265;
const float TAU = 6.28318531;

vec4 render_visual(vec2 uv) {
  vec2 p = (uv - 0.5) * u_resolution / (0.5 * min(u_resolution.x, u_resolution.y));
  float r = max(length(p), 0.0001);
  float log_r = log(r);
  // Slopes worked out from the plane, one pixel wide: atan's seam would spike fwidth.
  float pixel = 2.0 / min(u_resolution.x, u_resolution.y) / r;
  float arm = u_arms * (atan(p.y, p.x) + u_twist * log_r) / TAU + u_turn * u_arms;
  float ring = u_rings * u_arms * log_r / TAU + u_crawl;
  float arm_w = max(u_arms * sqrt(1.0 + u_twist * u_twist) * pixel / TAU, 0.0001);
  float ring_w = max(u_rings * u_arms * pixel / TAU, 0.0001);
  float arm_side = clamp(sin(arm * PI) / (PI * arm_w * 0.5), -1.0, 1.0);
  float ring_side = u_rings > 0.0 ? clamp(sin(ring * PI) / (PI * ring_w * 0.5), -1.0, 1.0) : 1.0;
  float a_side = 0.5 + 0.5 * arm_side * ring_side;
  // An arm runs between whole values of \`arm\`, so its middle is at the half.
  float from_middle = abs(fract(arm) - 0.5);
  float fill = u_thickness >= 0.999
    ? 1.0
    : clamp((u_thickness * 0.5 - from_middle) / arm_w + 0.5, 0.0, 1.0);
  float alpha = mix(u_colorB.a, u_colorA.a, a_side);
  vec3 rgb = mix(u_colorB.rgb * u_colorB.a, u_colorA.rgb * u_colorA.a, a_side);
  // Where the spiral is finer than a pixel it fades rather than shimmers.
  float resolved = 1.0 - smoothstep(0.35, 0.7, arm_w);
  return vec4(rgb / max(alpha, 0.0001), alpha * fill * resolved);
}`,
  create() {
    let turn = 0;
    let crawl = 0;
    let held = 0;
    return {
      update({ dt, params, changed }) {
        held += dt;
        const boost = Math.min(MAX_BOOST, 1 + params.acceleration * held);
        // The picture repeats every whole turn and every two rings.
        turn = (turn + dt * params.spin * boost + 1) % 1;
        crawl = (crawl + dt * params.pull * boost) % 2;
        const moving =
          params.spin !== 0 || (params.pull > 0 && params.rings > 0);
        return {
          changed: changed || moving,
          blank: params.colorA[3] <= 0 && params.colorB[3] <= 0,
          uniforms: { turn, crawl },
        };
      },
    };
  },
});
