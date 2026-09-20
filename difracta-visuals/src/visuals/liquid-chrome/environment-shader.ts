/**
 * The GLSL of the studio Liquid Chrome reflects, looked up by direction,
 * built the way a chrome ball reads: a dark floor glowing near the
 * horizon, a sharp horizon with a ring of light along it, a sky lifting
 * toward two crisp white overhead bars turning with the lights, and eight
 * softbox strips standing around the stage alternating Light Colors A and
 * B. A Kick pulses every light; a Flash burns them white.
 */
export const ENVIRONMENT_SHADER = `
vec3 chrome_environment(vec3 direction) {
  float y = direction.y;
  vec3 a = u_lightColorA.rgb * u_lightColorA.a;
  vec3 b = u_lightColorB.rgb * u_lightColorB.a;
  float pulse = 1.0 + 1.5 * u_kick;
  vec3 ground = vec3(0.012, 0.011, 0.016) + (a + b) * 0.035 * (1.0 - smoothstep(0.0, 0.6, -y));
  vec3 sky = vec3(0.12, 0.12, 0.15) + (a + b) * 0.07
    + vec3(0.42, 0.42, 0.48) * smoothstep(0.05, 1.0, y)
    + vec3(0.22, 0.22, 0.26) * exp(-y * 9.0);
  vec3 stage = mix(ground, sky, smoothstep(-0.01, 0.01, y));
  float azimuth = atan(direction.z, direction.x) / TAU + u_lights;
  float cell = floor(azimuth * 8.0);
  float across = abs(fract(azimuth * 8.0) - 0.5);
  float strip = (1.0 - smoothstep(0.1, 0.125, across))
    * (1.0 - smoothstep(0.3, 0.34, abs(y - 0.12)));
  vec3 strip_color = mod(cell, 2.0) < 0.5 ? a : b;
  float bars = 0.0;
  if (y > 0.2) {
    vec2 q = chrome_turn(u_lights * TAU) * (direction.xz / y);
    vec2 near = abs(q - vec2(0.0, 0.32)) - vec2(0.75, 0.09);
    vec2 far = abs(q + vec2(0.0, 0.32)) - vec2(0.75, 0.09);
    float edge = min(max(near.x, near.y), max(far.x, far.y));
    bars = 1.0 - smoothstep(0.0, 0.03, edge);
  }
  float ring = exp(-abs(y - 0.02) * 60.0);
  vec3 ring_color = mix(a, b, 0.5 + 0.5 * sin(azimuth * TAU * 2.0));
  vec3 lights = strip_color * strip * 2.6 + vec3(1.7) * bars + ring_color * ring * 1.4;
  return stage + lights * pulse + vec3(strip + bars + ring) * u_flash * 3.0;
}
`;
