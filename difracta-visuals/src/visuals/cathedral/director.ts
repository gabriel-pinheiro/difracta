import { smooth } from "@difracta/render/sdk";

/**
 * Cathedral's show director: which part of a track is playing, how far a
 * Build has climbed, and the envelopes Cues leave behind. It knows nothing
 * of the GPU; every frame it blends the sections by weights that ease
 * toward the one playing, so a Cue never snaps the picture, and hands the
 * rig and camera a look to follow.
 */
export const SECTIONS = ["calm", "build", "drop", "breakdown"] as const;
export type Section = (typeof SECTIONS)[number];

interface Levels {
  /** Fixture brightness before Energy. */
  readonly beam: number;
  /** Fixture sweep speed. */
  readonly sweep: number;
  /** Fog density multiplier. */
  readonly fog: number;
  /** Camera speed multiplier. */
  readonly travel: number;
  /** Uplight wash on the pillars, before kicks. */
  readonly wash: number;
  /** Laser fan brightness. */
  readonly laser: number;
  /** Ambient light on the stone. */
  readonly dim: number;
}

function levels(section: Section, progress: number): Levels {
  switch (section) {
    case "calm":
      return {
        beam: 0.5,
        sweep: 0.3,
        fog: 1,
        travel: 1,
        wash: 0.35,
        laser: 0.25,
        dim: 1,
      };
    case "build":
      return {
        beam: 0.45 + 0.55 * progress,
        sweep: 0.2 + 1.2 * progress,
        fog: 1 + 0.9 * progress,
        travel: 1 - 0.7 * progress,
        wash: 0.2 + 0.4 * progress,
        laser: 0.6 * progress,
        dim: 0.8,
      };
    case "drop":
      return {
        beam: 1.35,
        sweep: 1.7,
        fog: 0.85,
        travel: 1.4,
        wash: 1,
        laser: 1.25,
        dim: 1.1,
      };
    case "breakdown":
      return {
        beam: 0.8,
        sweep: 0.15,
        fog: 1.2,
        travel: 0.45,
        wash: 0.08,
        laser: 0,
        dim: 0.6,
      };
  }
}

/** How fast the weights ease toward a section, per second, by the section entered. */
const ENTRY_RATE: Readonly<Record<Section, number>> = {
  calm: 1.2,
  build: 1.6,
  drop: 9,
  breakdown: 1.4,
};
const KICK_DECAY = 7;
const STROBE_DECAY = 16;
const SURGE_DECAY = 0.9;
const SHAKE_DECAY = 3.2;
/** What a kick adds to the shake envelope. */
const KICK_SHAKE = 0.3;
/** How much faster the camera flies at the top of a Drop's surge. */
const SURGE_TRAVEL = 2.2;

export interface DirectorLook extends Levels {
  readonly section: Section;
  /** From 0 at a Build's Cue to 1 after Build Duration. */
  readonly buildProgress: number;
  /** How much the beams converge on the nave, 0 to 1. */
  readonly focus: number;
  /** How much the beams sweep wild, 0 to 1. */
  readonly wild: number;
  /** How much the rig gives way to the one solo beam, 0 to 1. */
  readonly solo: number;
  /** The strobe bank, 0 to 1. */
  readonly strobe: number;
  /** The camera shake envelope, 0 to 1. */
  readonly shake: number;
  /** Kicks so far, which steps the uplight chase. */
  readonly kicks: number;
}

export interface Director {
  readonly section: Section;
  cue(key: string): void;
  /** Advances by `dt` seconds; a Build climbs over `buildSeconds`. */
  advance(dt: number, buildSeconds: number): DirectorLook;
}

export function createDirector(): Director {
  let section: Section = "calm";
  const weights: Record<Section, number> = {
    calm: 1,
    build: 0,
    drop: 0,
    breakdown: 0,
  };
  let progress = 0;
  let kick = 0;
  let strobe = 0;
  let surge = 0;
  let shake = 0;
  let kicks = 0;
  const enter = (next: Section): void => {
    if (next === "build" && section !== "build") progress = 0;
    section = next;
  };
  return {
    get section() {
      return section;
    },
    cue(key) {
      switch (key) {
        case "kick":
          kick = 1;
          shake = Math.min(1, shake + KICK_SHAKE);
          kicks = (kicks + 1) % 64;
          return;
        case "strobe":
          strobe = 1;
          return;
        case "drop":
          enter("drop");
          strobe = 1;
          surge = 1;
          shake = 1;
          return;
        case "build":
        case "breakdown":
        case "calm":
          enter(key);
      }
    },
    advance(dt, buildSeconds) {
      if (section === "build")
        progress = Math.min(1, progress + dt / Math.max(0.1, buildSeconds));
      const rate = ENTRY_RATE[section];
      for (const name of SECTIONS)
        weights[name] = smooth(
          weights[name],
          name === section ? 1 : 0,
          dt,
          rate,
        );
      kick *= Math.exp(-KICK_DECAY * dt);
      strobe *= Math.exp(-STROBE_DECAY * dt);
      surge *= Math.exp(-SURGE_DECAY * dt);
      shake *= Math.exp(-SHAKE_DECAY * dt);
      const mixed = {
        beam: 0,
        sweep: 0,
        fog: 0,
        travel: 0,
        wash: 0,
        laser: 0,
        dim: 0,
      };
      for (const name of SECTIONS) {
        const own = levels(name, progress);
        const weight = weights[name];
        for (const key of Object.keys(mixed) as (keyof Levels)[])
          mixed[key] += own[key] * weight;
      }
      return {
        ...mixed,
        travel: mixed.travel + surge * SURGE_TRAVEL,
        wash: mixed.wash + kick * 0.9,
        section,
        buildProgress: progress,
        focus: weights.build * (0.3 + 0.7 * progress),
        wild: weights.drop,
        solo: weights.breakdown,
        strobe,
        shake: Math.min(1, shake + surge * 0.35),
        kicks,
      };
    },
  };
}
