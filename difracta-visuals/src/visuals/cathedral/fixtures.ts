import type { DirectorLook } from "./director.ts";

/**
 * Cathedral's lighting rig, packed for the fragment: moving heads hung in
 * pairs down the nave, one per bay, and a laser fan far ahead. A fixture's
 * aim is a function of its world row and side, never of its slot in the
 * array, so as the camera passes a row and every slot shifts, no beam
 * jumps; rows fade in far ahead and out overhead.
 */
export const BAY = 4;
/** Twelve rig fixtures and the Breakdown's solo beam. */
export const MAX_BEAMS = 13;
export const MAX_LASERS = 8;
const RIG_X = 3.2;
const RIG_Y = 10.2;
/** How far ahead the Build's beams converge. */
const FOCUS_AHEAD = 22;
const SOLO_AHEAD = 12;
const LASER_AHEAD = 30;
/** Over how much of a bay a row fades in or out. */
const FADE = 1.5;
/** Phase between neighbouring rows: eight rows make a whole turn, so the camera wrap is seamless. */
const ROW_PHASE = Math.PI / 4;

export interface RigFrame {
  readonly cameraZ: number;
  /** The rig's integrated sweep clock. */
  readonly time: number;
  /** The Beams Parameter. */
  readonly beams: number;
  readonly energy: number;
  readonly look: DirectorLook;
}

type Vector = [number, number, number];

function aim(tilt: number, pan: number): Vector {
  const reach = Math.sin(tilt);
  return [reach * Math.sin(pan), -Math.cos(tilt), reach * Math.cos(pan)];
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(...vector) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Writes `xyz, intensity` per beam into `origins` and `xyz, color mix` into
 * `directions`, and returns how many beams it wrote.
 */
export function packBeams(
  frame: RigFrame,
  origins: Float32Array,
  directions: Float32Array,
): number {
  const { look, time, cameraZ } = frame;
  const master = look.beam * (0.35 + 0.65 * frame.energy);
  let index = 0;
  const put = (
    origin: Vector,
    direction: Vector,
    intensity: number,
    tint: number,
  ): void => {
    origins.set([...origin, intensity], index * 4);
    directions.set([...normalize(direction), tint], index * 4);
    index += 1;
  };
  if (look.solo > 0.001)
    put(
      [0, RIG_Y + 0.5, cameraZ + SOLO_AHEAD],
      aim(0.32, time * 0.35),
      master * look.solo * 1.4,
      0,
    );
  const count = Math.max(0, Math.min(MAX_BEAMS - 1, Math.round(frame.beams)));
  const pairs = Math.ceil(count / 2);
  const firstRow = Math.floor(cameraZ / BAY) + 1;
  const calmWeight = Math.max(0, 1 - look.focus - look.wild);
  for (let slot = 0; slot < count; slot += 1) {
    const row = firstRow + Math.floor(slot / 2);
    const side = slot % 2 === 0 ? -1 : 1;
    const origin: Vector = [side * RIG_X, RIG_Y, row * BAY];
    const ahead = origin[2] - cameraZ;
    const fade =
      smoothstep(0, FADE, ahead) *
      smoothstep(pairs * BAY, pairs * BAY - FADE, ahead);
    const phase = row * ROW_PHASE + (side > 0 ? Math.PI / 2 : 0);
    const calm = aim(
      0.5 + 0.28 * Math.sin(time * 0.7 + phase),
      side * -0.35 + 0.7 * Math.sin(time * 0.5 + phase * 2),
    );
    const wobble = (1 - look.buildProgress) * 0.3;
    const focus = normalize([
      -origin[0] + Math.cos(time * 2 + phase) * wobble * 10,
      2 - RIG_Y,
      FOCUS_AHEAD - ahead + Math.sin(time * 2 + phase) * wobble * 10,
    ]);
    const swing = 0.5 - 0.5 * Math.cos(time * 0.9 + phase);
    const wild = aim(
      0.85 + 0.3 * Math.sin(time * 2.3 + phase * 2),
      -side *
        (0.4 + 1.3 * (0.5 - 0.5 * Math.cos(time * 1.7 + phase)) + swing * 0.8),
    );
    const direction: Vector = [0, 1, 2].map(
      (axis) =>
        (calm[axis] ?? 0) * calmWeight +
        (focus[axis] ?? 0) * look.focus +
        (wild[axis] ?? 0) * look.wild,
    ) as Vector;
    const tint = (((row % 2) + 2) % 2 === 0) === side < 0 ? 0 : 1;
    put(origin, direction, master * fade * (1 - look.solo), tint);
  }
  return index;
}

export interface LaserFrame {
  readonly cameraZ: number;
  /** The fan's integrated clock. */
  readonly time: number;
  /** The Lasers Parameter. */
  readonly amount: number;
  readonly energy: number;
  readonly look: DirectorLook;
}

/** Writes `xyz, intensity` per laser into `directions`; returns the fan's origin and how many it wrote. */
export function packLasers(
  frame: LaserFrame,
  directions: Float32Array,
): { readonly origin: Vector; readonly count: number } {
  const { look, time } = frame;
  const origin: Vector = [
    Math.sin(time * 0.2) * 0.6,
    5.2,
    frame.cameraZ + LASER_AHEAD,
  ];
  const level = frame.amount * look.laser * (0.3 + 0.7 * frame.energy);
  if (level <= 0.001) return { origin, count: 0 };
  const spread = 0.5 + 0.3 * look.wild;
  const roll = look.wild * Math.sin(time * 0.8) * 0.5;
  for (let laser = 0; laser < MAX_LASERS; laser += 1) {
    const angle = (laser / (MAX_LASERS - 1) - 0.5) * 2 * spread;
    const pitch =
      Math.sin(time * 1.3) * 0.1 -
      0.02 +
      look.wild * Math.sin(time * 3.1 + laser) * 0.06;
    const x = Math.sin(angle);
    const z = -Math.cos(angle);
    const rolled: Vector = [
      x * Math.cos(roll) - pitch * Math.sin(roll),
      x * Math.sin(roll) + pitch * Math.cos(roll),
      z,
    ];
    const flicker = 0.75 + 0.25 * Math.sin(time * 5 + laser * 1.7);
    directions.set(
      [...normalize(rolled), level * (1 - look.wild * (1 - flicker))],
      laser * 4,
    );
  }
  return { origin, count: MAX_LASERS };
}
