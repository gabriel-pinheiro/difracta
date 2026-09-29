import { settings, tempoOf, type MediaBeats } from "@difracta/core";

/**
 * What Video does with a tempo. A clip of `beats` beats lasting `duration`
 * seconds has a tempo of its own; played at `tempo / its own` it pulses at
 * the song's. Speed stays a multiplier on top, read as a power of two,
 * since the pulse lands on the beat at no other: at ×½ on every other
 * beat, at ×2 on every beat with one between.
 *
 * Tempo alone leaves the phase free. A beat Cue says a beat of the song is
 * now, so the clip should be on a line of its grid: its first beat plus any
 * number of song beats, in seconds of the clip. How far it is from the
 * nearest line is what it owes, and the chase pays that by bending the
 * rate, never by seeking, so nothing on the Surface jumps.
 */
const { maxBend, chaseSeconds, lockedWithin, bendStep, minSpeed, maxSpeed } =
  settings.media.video.sync;

/** The rates a video element takes. */
const MIN_RATE = 0.0625;
const MAX_RATE = 16;

export const clampRate = (rate: number): number =>
  Math.min(MAX_RATE, Math.max(MIN_RATE, rate));

/** Speed as the nearest power of two, by ratio, within what sync allows. */
export function syncedSpeed(speed: number): number {
  const snapped = 2 ** Math.round(Math.log2(Math.max(speed, MIN_RATE)));
  return Math.min(maxSpeed, Math.max(minSpeed, snapped));
}

export interface SyncedClip {
  /** The rate that makes the clip pulse at the tempo, before any bend. */
  readonly rate: number;
  /** One beat of the song in seconds of the clip: the distance between grid lines. */
  readonly grid: number;
  readonly firstBeat: number;
}

/** How a clip follows `tempo`; undefined for one whose length is not known yet. */
export function syncClip(
  { beats, firstBeat }: MediaBeats,
  duration: number,
  tempo: number,
  speed: number,
): SyncedClip | undefined {
  if (!(duration > 0)) return undefined;
  const multiplier = syncedSpeed(speed);
  return {
    rate: (tempo / tempoOf(beats, duration)) * multiplier,
    grid: (duration / beats) * multiplier,
    firstBeat,
  };
}

/**
 * What a clip at `position` owes to be on the nearest grid line, in seconds
 * of the clip: positive when it is behind and must gain, negative when it is
 * ahead and must lose, never more than half a grid either way.
 */
export function owedAt(position: number, { grid, firstBeat }: SyncedClip) {
  const past = (((position - firstBeat) % grid) + grid) % grid;
  return past <= grid / 2 ? -past : grid - past;
}

export interface Chase {
  /** A beat Cue measured what the clip owes; it replaces what was left. */
  measure(owed: number): void;
  /**
   * The bend for a frame of `dt` seconds at `rate`, as a fraction of the
   * rate, and what it pays taken off what is owed.
   */
  advance(dt: number, rate: number): number;
  /** Nothing is owed: the clip stopped, was swapped or is no longer synced. */
  reset(): void;
  readonly owed: number;
}

export function createChase(): Chase {
  let owed = 0;
  return {
    measure(next) {
      owed = Math.abs(next) <= lockedWithin ? 0 : next;
    },
    advance(dt, rate) {
      // A rate of zero, a Tempo of zero, would never pay.
      if (owed === 0 || !(rate > 0)) return 0;
      const wanted = owed / (rate * chaseSeconds);
      const steps = Math.round(Math.min(maxBend, Math.abs(wanted)) / bendStep);
      const bend = Math.sign(owed) * Math.max(1, steps) * bendStep;
      const left = owed - rate * bend * dt;
      // Paid, or within reach of the beat: the rate goes back to the tempo's.
      owed =
        Math.sign(left) !== Math.sign(owed) || Math.abs(left) <= lockedWithin
          ? 0
          : left;
      return bend;
    },
    reset() {
      owed = 0;
    },
    get owed() {
      return owed;
    },
  };
}
