import { rateTimer, smoothstep, type Random } from "@difracta/render/sdk";

import { FORM_OPTIONS, type LiquidChromeValues } from "./parameters.ts";

/** How fast each swell dies away, per second. */
const KICK_DECAY = 6;
const FLASH_DECAY = 8;
const SHAKE_DECAY = 5;
/** A Shatter, in seconds: the burst out, the hang in the air, the pull back together. */
export const SHATTER_BURST = 0.16;
export const SHATTER_HANG = 0.45;
export const SHATTER_GATHER = 2.2;
/** How much shake each hit adds, and the most it can pile up to. */
const KICK_SHAKE = 0.35;
const FLASH_SHAKE = 0.15;
const SHATTER_SHAKE = 1;
const MAX_SHAKE = 1.5;
/** The furthest the camera is knocked, in screen heights, at Shake 100% and one full hit. */
const SHAKE_REACH = 0.05;

/** Everything the fragment reads that time and Cues move, for one frame. */
export interface ChromeFrame {
  /** The clock the surface wobbles and the forms move by. */
  readonly time: number;
  /** Camera orbit and studio light rotation, in turns. */
  readonly orbit: number;
  readonly lights: number;
  /** The form shown, the one being morphed to, and how far along (eased). */
  readonly formA: number;
  readonly formB: number;
  readonly morph: number;
  /** The Kick swell from 1 down, and seconds since the last Kick. */
  readonly kick: number;
  readonly ripple: number;
  readonly flash: number;
  /** How far the droplets are out, 0 when whole, and how far they have circled. */
  readonly shatter: number;
  readonly shatterSpin: number;
  /** Camera offset in screen heights, and roll in radians. */
  readonly cameraShake: readonly [number, number, number];
}

export interface Director {
  cue(key: string): void;
  advance(dt: number, params: LiquidChromeValues): ChromeFrame;
}

export function formIndex(value: string): number {
  return Math.max(
    0,
    FORM_OPTIONS.findIndex((option) => option.value === value),
  );
}

const wrap = (turns: number): number => ((turns % 1) + 1) % 1;

/** How far out a Shatter's droplets are `age` seconds in, bursting from `from`. */
export function shatterAmount(age: number, from: number): number {
  if (age < SHATTER_BURST) {
    const t = age / SHATTER_BURST;
    return from + (1 - from) * (1 - (1 - t) * (1 - t));
  }
  if (age < SHATTER_BURST + SHATTER_HANG) return 1;
  return 1 - smoothstep(0, SHATTER_GATHER, age - SHATTER_BURST - SHATTER_HANG);
}

/**
 * Liquid Chrome's state between frames: the clocks, the morph from one
 * form to the next, and the envelopes Kick, Flash and Shatter start. A
 * morph asked for while one runs waits for it to finish, the latest ask
 * winning, so the sculpture never jumps between forms.
 */
export function createDirector(
  random: Random,
  initial: LiquidChromeValues,
): Director {
  const timer = rateTimer(random);
  let time = random() * 30;
  let orbit = random();
  let lights = random();
  let form = formIndex(initial.form);
  let target = form;
  let progress = 0;
  let queued: number | "next" | undefined;
  let chosen: string = initial.form;
  let order: string = initial.formOrder;
  let kick = 0;
  let ripple = 10;
  let flash = 0;
  let shake = 0;
  let shakePhase = random() * 100;
  let shatter = 0;
  let shatterAge: number | undefined;
  let shatterFrom = 0;
  let shatterSpin = 0;

  const next = (from: number): number => {
    const count = FORM_OPTIONS.length;
    if (order !== "random") return (from + 1) % count;
    return (from + 1 + Math.floor(random() * (count - 1))) % count;
  };
  const request = (wanted: number | "next"): void => {
    if (target !== form) {
      queued = wanted;
      return;
    }
    target = wanted === "next" ? next(form) : wanted;
    progress = 0;
  };

  return {
    cue(key) {
      if (key === "kick") {
        kick = 1;
        ripple = 0;
        shake = Math.min(MAX_SHAKE, shake + KICK_SHAKE);
      } else if (key === "flash") {
        flash = 1;
        shake = Math.min(MAX_SHAKE, shake + FLASH_SHAKE);
      } else if (key === "shatter") {
        shatterFrom = shatter;
        shatterAge = 0;
        shake = Math.min(MAX_SHAKE, shake + SHATTER_SHAKE);
      } else if (key === "morph") request("next");
    },
    advance(dt, params) {
      order = params.formOrder;
      if (params.form !== chosen) {
        chosen = params.form;
        request(formIndex(params.form));
      }
      for (
        let fired = timer.advance(dt, params.automaticRate);
        fired > 0;
        fired -= 1
      )
        request("next");
      time += dt * (0.35 + params.energy * 1.3);
      orbit = wrap(
        orbit + dt * params.rotationSpeed * (0.6 + params.energy * 0.8),
      );
      lights = wrap(lights + dt * (0.015 + params.energy * 0.06));
      if (target !== form) {
        progress += dt / Math.max(0.05, params.morphDuration / 1000);
        if (progress >= 1) {
          form = target;
          progress = 0;
          const waiting = queued;
          queued = undefined;
          if (waiting !== undefined) request(waiting);
        }
      }
      kick *= Math.exp(-KICK_DECAY * dt);
      flash *= Math.exp(-FLASH_DECAY * dt);
      shake *= Math.exp(-SHAKE_DECAY * dt);
      ripple += dt;
      if (shatterAge !== undefined) {
        shatterAge += dt;
        shatter = shatterAmount(shatterAge, shatterFrom);
        if (shatterAge >= SHATTER_BURST + SHATTER_HANG + SHATTER_GATHER) {
          shatterAge = undefined;
          shatter = 0;
        }
      }
      shatterSpin += dt * (0.8 + params.energy * 2);
      shakePhase += dt * 29;
      const reach = shake * params.shake * SHAKE_REACH;
      return {
        time,
        orbit,
        lights,
        formA: form,
        formB: target,
        morph: target === form ? 0 : smoothstep(0, 1, progress),
        kick,
        ripple,
        flash,
        shatter,
        shatterSpin,
        cameraShake: [
          reach *
            (Math.sin(shakePhase) * 0.6 +
              Math.sin(shakePhase * 2.31 + 1.3) * 0.4),
          reach *
            (Math.sin(shakePhase * 1.13 + 2.1) * 0.6 +
              Math.sin(shakePhase * 2.71 + 0.4) * 0.4),
          reach * 1.5 * Math.sin(shakePhase * 0.87 + 0.7),
        ],
      };
    },
  };
}
