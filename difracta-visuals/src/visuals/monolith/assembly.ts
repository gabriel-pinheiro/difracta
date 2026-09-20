import { WAVE_LIFETIME, type MonolithLook } from "./director.ts";
import type { MonolithValues } from "./parameters.ts";

export const ROWS = 13;
export const SLABS = ROWS * 2;
export const HALF_SIZE = [0.46, 0.145, 0.52] as const;

/** The same wave drives both a slab's compression and its light. */
export function waveAt(row: number, ages: readonly number[]): number {
  let pulse = 0;
  for (const age of ages) {
    const distance = row / (ROWS - 1) - (age * 1.7 - 0.12);
    pulse +=
      Math.exp(-distance * distance * 110) *
      Math.max(0, 1 - age / WAVE_LIFETIME);
  }
  return Math.min(1.8, pulse);
}

/** Positions and rotations are worked out once per frame, outside the fragment. */
export function packAssembly(
  look: MonolithLook,
  params: MonolithValues,
  poses: Float32Array,
  turns: Float32Array,
): void {
  const open = look.opening * (0.35 + params.separation * 0.9);
  const twist = params.torsion * (0.3 + look.energy * 0.7) * look.opening;
  const spacing = 0.307 + open * 0.115;
  const [helix = 0, orbit = 0, fan = 0] = look.configurations;
  for (let row = 0; row < ROWS; row += 1) {
    const unit = (row - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
    const wave = waveAt(row, look.waves);
    const yaw =
      twist *
      (helix * unit * 3.8 +
        orbit * Math.sin(look.phase + unit * 3) * 3.2 +
        fan * unit * Math.cos(look.phase) * 4.2);
    const turn = yaw + Math.sin(look.phase + unit * 2) * open * 0.14;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const breathing = 0.5 + 0.5 * Math.sin(look.phase * 2 + unit * 3);
    const gap =
      0.018 +
      open * (0.4 + 0.5 * breathing + 0.25 * orbit) +
      look.impact * 0.28 -
      wave * open * 0.045;
    const x =
      open *
      (orbit * Math.sin(look.phase + unit * 3) * 0.45 +
        fan * unit * unit * 0.6);
    const z = open * orbit * Math.cos(look.phase + unit * 3) * 0.4;
    const y = unit * 6 * spacing + wave * 0.035 * Math.sin(unit * 3);
    for (let side = 0; side < 2; side += 1) {
      const index = row * 2 + side;
      const across = (side === 0 ? -1 : 1) * (HALF_SIZE[0] + gap);
      poses.set([x + across * c, y, z + across * s, wave], index * 4);
      turns.set([c, s, row / (ROWS - 1), side], index * 4);
    }
  }
}
