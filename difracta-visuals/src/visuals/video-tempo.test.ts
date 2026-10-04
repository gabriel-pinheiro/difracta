import { describe, expect, it } from "vitest";

import { stage } from "./media-fakes.ts";

describe("Video synced to a tempo", () => {
  /** A 16-beat loop of 7.5 s, 128 BPM, playing with its length known. */
  function loop(values: Record<string, unknown> = {}) {
    const staged = stage(
      { sync: true, tempo: 128, ...values },
      { clip: { beats: 16, firstBeat: 0 } },
    );
    staged.frame({ sync: false });
    staged.clip().duration = 7.5;
    return staged;
  }

  it("plays at the tempo over the clip's own, Speed a power of two on top", () => {
    const { frame, clip } = loop();
    frame();
    expect(clip().rate).toBe(1);
    frame({ tempo: 140 });
    expect(clip().rate).toBeCloseTo(140 / 128);
    frame({ tempo: 140, speed: 0.6 });
    expect(clip().rate).toBeCloseTo(70 / 128);
    frame({ tempo: 64, speed: 2.3 });
    expect(clip().rate).toBe(1);
    frame({ tempo: 0 }); // the slowest a video plays
    expect(clip().rate).toBe(0.0625);
    frame({ sync: false, speed: 0.6 });
    expect(clip().rate).toBe(0.6);
  });

  it("plays at Speed when the entry has no beats or its length is not known", () => {
    const bare = stage({ sync: true, tempo: 140, speed: 0.6 });
    bare.frame();
    bare.clip().duration = 7.5;
    bare.frame();
    expect(bare.clip().rate).toBe(0.6);
    const early = stage(
      { sync: true, tempo: 140 },
      { clip: { beats: 16, firstBeat: 0 } },
    );
    early.frame();
    expect(early.clip().rate).toBe(1);
  });

  it("bends the rate after a Beat Cue until the beat is reached, never seeking", () => {
    const { frame, cue, clip } = loop();
    frame();
    clip().calls.length = 0;
    // A tenth of a second past a beat: ahead, so it slows down.
    clip().position = 7.5 / 16 + 0.1;
    cue("beat");
    frame();
    expect(clip().rate).toBeCloseTo(0.9);
    let frames = 0;
    while (clip().rate !== 1 && frames < 600) {
      frame();
      frames += 1;
    }
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(200);
    expect(clip().calls).not.toContain("rewind");
    // Behind the next beat by less: it speeds up, less hard.
    clip().position = 7.5 / 8 - 0.02;
    cue("beat");
    frame();
    expect(clip().rate).toBeGreaterThan(1);
    expect(clip().rate).toBeLessThan(1.1);
  });

  it("ignores a Beat Cue while not synced, paused or hidden, and forgets the chase on a restart", () => {
    const { frame, cue, clip, hide } = loop();
    frame();
    clip().position = 0.1;
    frame({ sync: false });
    cue("beat");
    frame({ sync: false });
    expect(clip().rate).toBe(1);
    frame();
    cue("pause");
    cue("beat");
    cue("play");
    frame();
    expect(clip().rate).toBe(1);
    hide();
    cue("beat");
    frame();
    expect(clip().rate).toBe(1);
    cue("beat");
    frame();
    expect(clip().rate).toBeCloseTo(0.9);
    cue("play"); // restarts from the first frame, owing nothing
    frame();
    expect(clip().rate).toBe(1);
  });
});
