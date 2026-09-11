import type { Color } from "@difracta/core";

import type { Random } from "./random.ts";

/**
 * Grow or shrink `list` in place to `count` entries, making new ones at
 * the end and dropping from the end, so a count Parameter change leaves
 * every surviving entity where it was.
 */
export function fit<T>(
  list: T[],
  count: number,
  make: (index: number) => T,
): void {
  const wanted = Math.max(0, Math.round(count));
  while (list.length > wanted) list.pop();
  while (list.length < wanted) list.push(make(list.length));
}

/**
 * Move `current` toward `target` at `rate` per second, frame-rate
 * independent: for a Parameter a Visual wants to ease rather than snap.
 */
export function smooth(
  current: number,
  target: number,
  dt: number,
  rate: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** GLSL's smoothstep: 0 below `edge0`, 1 above `edge1`, an ease between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A Color as a CSS `rgba()` string; `alpha` replaces the Color's own. */
export function cssColor(color: Color, alpha: number = color[3]): string {
  const channel = (value: number): number =>
    Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${channel(color[0])}, ${channel(color[1])}, ${channel(color[2])}, ${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * Turns an Automatic Rate into events. Each frame it is advanced by the
 * frame's time and the current rate and says how many times to fire, so
 * a rate change only changes how fast the next firing approaches. The
 * spacing is jittered around the mean so it never sounds like a metronome.
 */
export interface RateTimer {
  advance(dt: number, rate: number): number;
}

export function rateTimer(random: Random): RateTimer {
  let budget = 0;
  let cost = random.between(0.6, 1.4);
  return {
    advance(dt, rate) {
      if (rate <= 0) return 0;
      budget += Math.max(0, dt) * rate;
      let fired = 0;
      while (budget >= cost) {
        budget -= cost;
        cost = random.between(0.6, 1.4);
        fired += 1;
      }
      return fired;
    },
  };
}

/**
 * A regular clock at a rate in hertz, for the mechanical beat of a Filter
 * or Visual that re-randomizes on every tick. `advance` says how many
 * ticks passed this frame and `phase` is the progress toward the next one,
 * so a rate change only changes how fast that next tick approaches.
 */
export interface Ticker {
  advance(dt: number, rate: number): number;
  /** From 0 at the last tick toward 1 at the next. */
  readonly phase: number;
}

export function ticker(): Ticker {
  let budget = 0;
  return {
    advance(dt, rate) {
      if (rate <= 0) return 0;
      budget += Math.max(0, dt) * rate;
      const fired = Math.floor(budget);
      budget -= fired;
      return fired;
    },
    get phase() {
      return budget;
    },
  };
}
