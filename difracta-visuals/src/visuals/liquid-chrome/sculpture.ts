/**
 * Where Liquid Chrome's moving parts are this frame, worked out once here
 * rather than in every step of every pixel's march: the mercury
 * satellites, the Shatter droplets and the sculpture's own slow turn.
 * Positions are in the sculpture's units, about one across.
 */
export const SATELLITES = 5;
export const DROPLETS = 9;
const GOLDEN_ANGLE = 2.39996;

type Column = readonly [number, number, number];

/** Each satellite's centre and radius, four numbers a satellite, circling in and out of the core. */
export function satellites(time: number): Float32Array {
  const packed = new Float32Array(SATELLITES * 4);
  for (let i = 0; i < SATELLITES; i += 1) {
    const reach = 0.62 + 0.3 * Math.sin(time * 0.5 + i * 1.3);
    packed.set(
      [
        Math.sin(time * 0.9 + i * 1.7) * reach,
        Math.sin(time * 0.7 + i * 2.9) * 0.8 * reach,
        Math.cos(time * 0.8 + i * 2.3) * reach,
        0.26 + 0.07 * Math.sin(i * 3.1),
      ],
      i * 4,
    );
  }
  return packed;
}

/**
 * Each droplet's centre and radius: spread evenly over a sphere, out as far
 * as `shatter` (0 whole, 1 fully burst) takes them, and circling the
 * vertical by `spin`, the outer ones at their own pace.
 */
export function droplets(shatter: number, spin: number): Float32Array {
  const packed = new Float32Array(DROPLETS * 4);
  for (let i = 0; i < DROPLETS; i += 1) {
    const height = 1 - (2 * (i + 0.5)) / DROPLETS;
    const ring = Math.sqrt(1 - height * height);
    const out = shatter * (1.15 + 0.35 * Math.sin(i * 5.3));
    const x = Math.cos(i * GOLDEN_ANGLE) * ring * out;
    const z = Math.sin(i * GOLDEN_ANGLE) * ring * out;
    const turn = spin * (0.7 + 0.15 * i);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    packed.set(
      [
        c * x + s * z,
        height * out,
        -s * x + c * z,
        (0.1 + 0.05 * Math.sin(i * 7.1 + 1)) * (0.3 + 0.7 * shatter) + 0.02,
      ],
      i * 4,
    );
  }
  return packed;
}

/** The columns of the sculpture's rotation: a slow turn about the vertical under a rocking tilt. */
export function axes(time: number): readonly [Column, Column, Column] {
  const yaw = time * 0.12;
  const tilt = 0.45 + 0.2 * Math.sin(time * 0.17);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return [
    [c, st * s, -ct * s],
    [0, ct, st],
    [s, -st * c, ct * c],
  ];
}
