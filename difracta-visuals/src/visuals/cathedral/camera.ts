import type { Random } from "@difracta/render/sdk";

/**
 * Where the camera travel wraps: a whole number of bays, of uplight chase
 * rows and of fixture phase rows, so every pattern the fragment and the
 * rig derive from a world position repeats exactly and the wrap is unseen.
 */
export const CAMERA_WRAP = 256;
/** World units a Camera Speed of 1 covers per second. */
const UNITS_PER_SECOND = 2.4;
/** Eye height above the floor. */
const EYE = 2.4;
/** The largest shake, in radians, at a full envelope and Shake. */
const SHAKE_REACH = 0.05;

export interface CameraPose {
  readonly position: readonly [number, number, number];
  /** Yaw, pitch and roll in radians; positive pitch looks up. */
  readonly turn: readonly [number, number, number];
}

export interface Camera {
  /** Advances travel by `speed` (a Camera Speed times the director's) and shakes by `shake`, 0 to 1. */
  advance(dt: number, speed: number, shake: number): CameraPose;
}

export function createCamera(random: Random): Camera {
  let z = random() * CAMERA_WRAP;
  // Real-time clocks: the slow sway of a dolly and the tremor a shake reads.
  let drift = random() * 100;
  let tremor = random() * 100;
  const quake = (a: number, b: number, c: number): number =>
    Math.sin(tremor * a) * 0.5 +
    Math.sin(tremor * b + 1.3) * 0.3 +
    Math.sin(tremor * c + 2.1) * 0.2;
  return {
    advance(dt, speed, shake) {
      z =
        (((z + dt * speed * UNITS_PER_SECOND) % CAMERA_WRAP) + CAMERA_WRAP) %
        CAMERA_WRAP;
      drift += dt;
      tremor += dt;
      const jolt = Math.max(0, shake) * SHAKE_REACH;
      return {
        position: [
          Math.sin(drift * 0.11) * 0.7 + quake(19, 27, 41) * jolt * 2,
          EYE + Math.sin(drift * 0.17) * 0.2 + quake(23, 31, 37) * jolt * 1.5,
          z,
        ],
        turn: [
          Math.sin(drift * 0.07) * 0.14 + quake(17, 29, 43) * jolt,
          0.16 + Math.sin(drift * 0.09) * 0.04 + quake(21, 33, 39) * jolt,
          Math.sin(drift * 0.05) * 0.035 + quake(13, 26, 47) * jolt * 0.6,
        ],
      };
    },
  };
}
