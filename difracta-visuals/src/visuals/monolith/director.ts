import { smooth } from "@difracta/render/sdk";

import type { MonolithValues } from "./parameters.ts";

export const SECTIONS = ["calm", "build", "drop", "breakdown"] as const;
type Section = (typeof SECTIONS)[number];
const TAU = Math.PI * 2;
export const WAVE_LIFETIME = 1.15;
const FLASH_LIFETIME = 0.55;
const IMPACT_LIFETIME = 2.5;

export interface MonolithLook {
  readonly section: Section;
  readonly buildProgress: number;
  readonly opening: number;
  readonly tension: number;
  readonly solo: number;
  readonly energy: number;
  readonly phase: number;
  readonly lightPhase: number;
  readonly flash: number;
  readonly impact: number;
  readonly shake: number;
  readonly configurations: readonly number[];
  readonly waves: readonly number[];
}

/** Section weights and geometry ease; clocks integrate rates, never sample elapsed time. */
export function createDirector(initial: MonolithValues) {
  let section: Section = "calm";
  const weights = { calm: 1, build: 0, drop: 0, breakdown: 0 };
  let progress = 0;
  let energy = initial.energy;
  let phase = 0;
  let lightPhase = 0;
  let opening = 0.18 + energy * 0.2;
  let flashAge = FLASH_LIFETIME;
  let impactAge = IMPACT_LIFETIME;
  let shake = 0;
  let configuration = 0;
  const configurations = [1, 0, 0];
  let waves: number[] = [];
  return {
    cue(key: string): void {
      if (key === "kick") {
        waves.push(0);
        shake = Math.min(1, shake + 0.25);
      } else if (key === "flash" || key === "strobe") {
        flashAge = 0;
      } else if (key === "reconfigure") {
        configuration = (configuration + 1) % configurations.length;
      } else if (SECTIONS.some((value) => value === key)) {
        if (key === "build" && section !== "build") progress = 0;
        section = key as Section;
        if (section === "drop") {
          flashAge = 0;
          impactAge = 0;
          shake = 1;
        }
      }
    },
    advance(dt: number, params: MonolithValues): MonolithLook {
      if (section === "build")
        progress = Math.min(1, progress + dt / params.buildDuration);
      energy = smooth(energy, params.energy, dt, 6);
      for (const key of SECTIONS)
        weights[key] = smooth(
          weights[key],
          key === section ? 1 : 0,
          dt,
          section === "drop" ? 12 : 2,
        );
      for (let i = 0; i < configurations.length; i += 1)
        configurations[i] = smooth(
          configurations[i] ?? 0,
          i === configuration ? 1 : 0,
          dt,
          1.4,
        );
      const target =
        weights.calm * (0.18 + energy * 0.2) +
        weights.build * (0.16 * (1 - progress)) +
        weights.drop * (0.65 + energy * 0.35) +
        weights.breakdown * 0.015;
      opening = smooth(opening, target, dt, section === "drop" ? 14 : 3);
      const speed =
        weights.calm * 0.65 +
        weights.build * (0.5 - progress * 0.42) +
        weights.drop * 1.5 +
        weights.breakdown * 0.15;
      phase =
        (phase + dt * params.motionSpeed * speed * (0.18 + energy * 0.35)) %
        TAU;
      lightPhase =
        (lightPhase +
          dt *
            params.motionSpeed *
            (0.22 + energy * 0.28) *
            (1 - weights.breakdown * 0.65)) %
        TAU;
      waves = waves.map((age) => age + dt).filter((age) => age < WAVE_LIFETIME);
      flashAge = Math.min(FLASH_LIFETIME, flashAge + dt);
      impactAge = Math.min(IMPACT_LIFETIME, impactAge + dt);
      shake *= Math.exp(-5 * dt);
      if (shake < 0.0001) shake = 0;
      return {
        section,
        buildProgress: progress,
        opening,
        tension: weights.build * progress,
        solo: weights.breakdown,
        energy,
        phase,
        lightPhase,
        flash:
          flashAge < FLASH_LIFETIME
            ? Math.exp(-12 * flashAge) * (1 - flashAge / FLASH_LIFETIME)
            : 0,
        impact:
          impactAge < IMPACT_LIFETIME
            ? Math.exp(-2.5 * impactAge) * (1 - impactAge / IMPACT_LIFETIME)
            : 0,
        shake,
        configurations: [...configurations],
        waves: [...waves],
      };
    },
  };
}
