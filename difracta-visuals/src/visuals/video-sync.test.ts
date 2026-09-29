import { describe, expect, it } from "vitest";

import {
  createChase,
  owedAt,
  syncClip,
  syncedSpeed,
  type SyncedClip,
} from "./video-sync.ts";

const loop = { beats: 16, firstBeat: 0 };

describe("Video sync", () => {
  it("reads Speed as the nearest power of two from a quarter to four", () => {
    expect([1, 0.9, 1.4, 1.5, 0.5, 0.7, 0.72, 3, 2.8].map(syncedSpeed)).toEqual(
      [1, 1, 1, 2, 0.5, 0.5, 1, 4, 2],
    );
    expect(syncedSpeed(0.0625)).toBe(0.25);
    expect(syncedSpeed(16)).toBe(4);
  });

  it("plays a clip at the ratio of the tempo to its own, times Speed", () => {
    // 16 beats in 7.5 s is 128 BPM.
    expect(syncClip(loop, 7.5, 128, 1)).toEqual({
      rate: 1,
      grid: 7.5 / 16,
      firstBeat: 0,
    });
    expect(syncClip(loop, 7.5, 140, 1)?.rate).toBeCloseTo(140 / 128);
    const half = syncClip(loop, 7.5, 128, 0.5);
    expect(half).toMatchObject({ rate: 0.5, grid: 7.5 / 32 });
    expect(syncClip(loop, 7.5, 64, 2)?.rate).toBe(1);
    expect(syncClip(loop, 0, 128, 1)).toBeUndefined();
  });

  it("owes the distance to the nearest beat, behind or ahead", () => {
    const clip: SyncedClip = { rate: 1, grid: 0.5, firstBeat: 0 };
    expect(owedAt(0, clip)).toBeCloseTo(0);
    expect(owedAt(1.1, clip)).toBeCloseTo(-0.1); // ahead: lose a tenth
    expect(owedAt(1.4, clip)).toBeCloseTo(0.1); // behind: gain a tenth
    expect(Math.abs(owedAt(0.25, clip))).toBeCloseTo(0.25);
    const late = { ...clip, firstBeat: 0.2 };
    expect(owedAt(0.2, late)).toBeCloseTo(0);
    expect(owedAt(0.1, late)).toBeCloseTo(0.1);
    expect(owedAt(0.75, late)).toBeCloseTo(-0.05);
  });

  it("pays what is owed by bending the rate a tenth at most, then lets go", () => {
    const chase = createChase();
    expect(chase.advance(1 / 60, 1)).toBe(0);
    chase.measure(0.2);
    let seconds = 0;
    let gained = 0;
    let strongest = 0;
    while (chase.owed !== 0 && seconds < 20) {
      const bend = chase.advance(1 / 60, 1);
      expect(bend).toBeGreaterThan(0);
      strongest = Math.max(strongest, bend);
      gained += bend / 60;
      seconds += 1 / 60;
    }
    expect(strongest).toBeCloseTo(0.1);
    expect(gained).toBeGreaterThan(0.19);
    expect(gained).toBeLessThanOrEqual(0.2);
    // Half a beat at 128 BPM is made up within a few seconds.
    expect(seconds).toBeLessThan(4);
    expect(chase.advance(1 / 60, 1)).toBe(0);
  });

  it("slows a clip that is ahead, and ignores a distance it cannot see", () => {
    const chase = createChase();
    chase.measure(-0.05);
    expect(chase.advance(1 / 60, 1)).toBeLessThan(0);
    chase.measure(0.004);
    expect(chase.owed).toBe(0);
    chase.measure(0.1);
    chase.reset();
    expect(chase.advance(1 / 60, 1)).toBe(0);
  });

  it("takes a new measure over what was left", () => {
    const chase = createChase();
    chase.measure(0.2);
    chase.advance(1 / 60, 1);
    chase.measure(-0.03);
    expect(chase.owed).toBe(-0.03);
  });
});
