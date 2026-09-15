import {
  createShaderPlayer,
  createVisualPlayer,
  recordingContext,
  type CanvasVisual,
  type ShaderVisual,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { colorWipe, WIPE_DIRECTIONS } from "./color-wipe.ts";
import { fireworks } from "./fireworks.ts";
import { noiseBurst } from "./noise-burst.ts";
import { petalBuild } from "./petal-build.ts";
import { shockwave } from "./shockwave.ts";
import { shootingStars } from "./shooting-stars.ts";
import { silkWisp } from "./silk-wisp.ts";
import { sparkShower } from "./spark-shower.ts";
import { CASCADE_DIRECTIONS, tileCascade } from "./tile-cascade.ts";

const DT = 1 / 60;
const WIDTH = 320;
const HEIGHT = 180;

function shader(visual: ShaderVisual) {
  const player = createShaderPlayer(visual, {
    width: WIDTH,
    height: HEIGHT,
    seed: "test",
  });
  return {
    cue: (key: string) => player.cue(key),
    frame: (values: Record<string, unknown> = {}, dt = DT) =>
      player.frame(dt, values as never, WIDTH, HEIGHT),
  };
}

function canvas(visual: CanvasVisual) {
  const recording = recordingContext();
  const player = createVisualPlayer(visual, {
    context: recording.context,
    width: WIDTH,
    height: HEIGHT,
    seed: "test",
  });
  return {
    recording,
    cue: (key: string) => player.cue(key),
    frame: (values: Record<string, unknown> = {}, dt = DT) =>
      player.frame(dt, values as never, {}),
  };
}

/** Steps a Visual until it draws by itself, or gives up. */
function firesByItself(
  step: (values: Record<string, unknown>) => { readonly blank: boolean },
  values: Record<string, unknown>,
  frames = 600,
): boolean {
  for (let index = 0; index < frames; index += 1)
    if (!step(values).blank) return true;
  return false;
}

describe("Shockwave", () => {
  it("expands a ring per Cue, keeps overlapping rings, and drops each at its Duration", () => {
    const { cue, frame } = shader(shockwave);
    const values = { automaticRate: 0, duration: 900 };
    expect(frame(values).blank).toBe(true);
    cue("shockwave");
    const first = frame(values);
    expect(first.blank).toBe(false);
    expect(first.uniforms.wave_count).toBe(1);
    // Three more rings fired through the first one's life are all live at once.
    for (let round = 0; round < 3; round += 1) {
      for (let index = 0; index < 6; index += 1) frame(values);
      cue("shockwave");
    }
    const many = frame(values);
    expect(many.uniforms.wave_count).toBe(4);
    const packed = (many.uniforms.waves as { values: Float32Array }).values;
    expect(packed[0]).toBeGreaterThan(packed[3] ?? 0); // the oldest leads
    expect(packed[9]).toBeGreaterThan(0); // and the newest is running too
    // 900 ms after the first, it is gone and the later ones are not.
    for (let index = 0; index < 35; index += 1) frame(values);
    expect(frame(values).uniforms.wave_count).toBe(3);
    for (let index = 0; index < 60; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Tile Cascade", () => {
  it("pins its Direction order, overlaps cascades, and drops each when its sweep ends", () => {
    expect(CASCADE_DIRECTIONS.map((option) => option.value)).toEqual([
      "left-to-right",
      "right-to-left",
      "top-to-bottom",
      "bottom-to-top",
      "random",
    ]);
    const { cue, frame } = shader(tileCascade);
    // 12 columns, 11 steps of 35 ms, then 90 ms hold and 280 ms fade: 755 ms.
    const values = { automaticRate: 0, columns: 12, step: 35, hold: 90 };
    expect(frame(values).blank).toBe(true);
    cue("cascade");
    expect(frame(values).uniforms.cascade_count).toBe(1);
    for (let index = 0; index < 6; index += 1) frame(values);
    cue("cascade");
    for (let index = 0; index < 6; index += 1) frame(values);
    cue("cascade");
    const three = frame(values);
    expect(three.uniforms.cascade_count).toBe(3);
    const packed = (three.uniforms.cascades as { values: Float32Array }).values;
    expect(packed[0]).toBeGreaterThan(packed[2] ?? 0);
    expect(packed[2]).toBeGreaterThan(packed[4] ?? 0);
    for (let index = 0; index < 32; index += 1) frame(values);
    expect(frame(values).uniforms.cascade_count).toBe(2);
    for (let index = 0; index < 60; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    // Random needs the longer of the two axes to finish its sweep: with 24
    // columns that is 23 steps, so it is still running where 4 rows would be over.
    const random = shader(tileCascade);
    const wide = {
      automaticRate: 0,
      direction: "random",
      columns: 24,
      rows: 4,
    };
    random.frame(wide);
    random.cue("cascade");
    for (let index = 0; index < 46; index += 1) random.frame(wide);
    expect(random.frame(wide).blank).toBe(false);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Color Wipe", () => {
  it("pins its Direction order and runs overlapping wipes at once", () => {
    expect(WIPE_DIRECTIONS.map((option) => option.value)).toEqual([
      "left-to-right",
      "right-to-left",
      "top-to-bottom",
      "bottom-to-top",
    ]);
    const { cue, frame } = shader(colorWipe);
    const values = { automaticRate: 0, travel: 700, hold: 120, fadeOut: 300 };
    expect(frame(values).blank).toBe(true);
    cue("wipe");
    expect(frame(values).uniforms.wipe_count).toBe(1);
    // A second wipe fired mid-fade re-covers what the first is giving up.
    for (let index = 0; index < 50; index += 1) frame(values);
    cue("wipe");
    const two = frame(values);
    expect(two.uniforms.wipe_count).toBe(2);
    const ages = two.uniforms.ages as Float32Array;
    expect(ages[0]).toBeCloseTo(52 / 60, 6);
    expect(ages[1]).toBeCloseTo(1 / 60, 6);
    // The first is done 1120 ms in; the second still has most of its life.
    for (let index = 0; index < 16; index += 1) frame(values);
    expect(frame(values).uniforms.wipe_count).toBe(1);
    for (let index = 0; index < 70; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Noise Burst", () => {
  it("counts each burst's generations from Rate and keeps overlapping bursts", () => {
    const { cue, frame } = shader(noiseBurst);
    const values = { automaticRate: 0, hold: 80, fadeOut: 2000, rate: 20 };
    const generations = (values_: Record<string, unknown>): number => {
      const packed = frame(values_).uniforms.bursts as {
        readonly values: Float32Array;
      };
      return packed.values[2] ?? 0;
    };
    expect(frame(values).blank).toBe(true);
    cue("burst");
    expect(frame(values).uniforms.burst_count).toBe(1);
    // Half a second at twenty a second is about ten generations.
    let counted = 0;
    for (let index = 0; index < 30; index += 1) counted = generations(values);
    expect(counted).toBeGreaterThanOrEqual(9);
    expect(counted).toBeLessThanOrEqual(11);
    // Dropping Rate slows the next generation; nothing is skipped or repeated.
    const slower = { ...values, rate: 5 };
    let later = 0;
    for (let index = 0; index < 30; index += 1) later = generations(slower);
    expect(later - counted).toBeGreaterThanOrEqual(2);
    expect(later - counted).toBeLessThanOrEqual(3);
    // A second burst runs alongside the first with its own count.
    cue("burst");
    const two = frame(values);
    expect(two.uniforms.burst_count).toBe(2);
    const packed = (two.uniforms.bursts as { values: Float32Array }).values;
    expect(packed[0]).toBeGreaterThan(packed[3] ?? 0); // the older is older
    expect(packed[2]).toBeGreaterThanOrEqual(later);
    expect(packed[5]).toBe(0);
    // The first is spent 2080 ms in; the second has a second still to run.
    for (let index = 0; index < 63; index += 1) frame(values);
    expect(frame(values).uniforms.burst_count).toBe(1);
    for (let index = 0; index < 65; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Fireworks", () => {
  it("draws a launch's bursts, keeps overlapping launches, and clears after its life", () => {
    const { cue, frame, recording } = canvas(fireworks);
    const values = { automaticRate: 0, bursts: 2, particles: 10 };
    expect(frame(values).blank).toBe(true);
    cue("launch");
    recording.clear();
    expect(frame(values)).toMatchObject({ blank: false, rendered: true });
    // Two bursts of ten sparks, each a trail and a head.
    expect(recording.callsTo("stroke")).toHaveLength(20);
    expect(recording.callsTo("arc")).toHaveLength(20);
    for (let index = 0; index < 20; index += 1) frame(values);
    cue("launch");
    recording.clear();
    frame(values);
    expect(recording.callsTo("stroke")).toHaveLength(40);
    // The first launch lives 1.4 s, so it is gone well before the second.
    for (let index = 0; index < 66; index += 1) frame(values);
    recording.clear();
    frame(values);
    expect(recording.callsTo("stroke")).toHaveLength(20);
    for (let index = 0; index < 30; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 2 })).toBe(true);
  });
});

describe("Petal Build", () => {
  it("latches a petal per Add Petal, caps them, and clears on Release", () => {
    const { cue, frame, recording } = canvas(petalBuild);
    const values = { automaticRate: 0, petals: 12, entryDuration: 1600 };
    const petals = () => recording.callsTo("bezierCurveTo").length / 2;
    expect(frame(values).blank).toBe(true);
    cue("addPetal");
    cue("addPetal");
    cue("addPetal");
    recording.clear();
    expect(frame(values)).toMatchObject({ blank: false, rendered: true });
    expect(petals()).toBe(3);
    // The petals stay once they are in: nothing re-derives them from a Cue age.
    for (let index = 0; index < 300; index += 1) frame(values);
    recording.clear();
    frame(values);
    expect(petals()).toBe(3);
    for (let index = 0; index < 5; index += 1) cue("addPetal");
    recording.clear();
    frame({ ...values, petals: 4 });
    expect(petals()).toBe(4);
    cue("release");
    recording.clear();
    expect(frame(values).blank).toBe(true);
    expect(petals()).toBe(0);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Shooting Stars", () => {
  it("shoots a star per Cue, overlaps them, and ends one when its trail is spent", () => {
    const { cue, frame, recording } = canvas(shootingStars);
    const values = {
      automaticRate: 0,
      sparks: 20,
      flightDuration: 1,
      trailPersistence: 0.5,
    };
    expect(frame(values).blank).toBe(true);
    cue("shoot");
    for (let index = 0; index < 20; index += 1) frame(values);
    recording.clear();
    expect(frame(values)).toMatchObject({ blank: false, rendered: true });
    const one = recording.callsTo("arc").length;
    expect(one).toBeGreaterThan(0);
    cue("shoot");
    for (let index = 0; index < 20; index += 1) frame(values);
    recording.clear();
    frame(values);
    expect(recording.callsTo("arc").length).toBeGreaterThan(one);
    // A star lives one second of flight plus half a second of trail.
    for (let index = 0; index < 50; index += 1) frame(values);
    expect(frame(values).blank).toBe(false);
    for (let index = 0; index < 40; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { ...values, automaticRate: 4 })).toBe(true);
  });
});

describe("Silk Wisp", () => {
  it("unfurls Strands filaments per Cue, overlaps wisps, and drops each at its Duration", () => {
    const { cue, frame, recording } = canvas(silkWisp);
    const values = { automaticRate: 0, duration: 1000, strands: 6 };
    expect(frame(values).blank).toBe(true);
    cue("wisp");
    recording.clear();
    expect(frame(values)).toMatchObject({ blank: false, rendered: true });
    expect(recording.callsTo("stroke")).toHaveLength(6);
    for (let index = 0; index < 20; index += 1) frame(values);
    cue("wisp");
    recording.clear();
    frame(values);
    expect(recording.callsTo("stroke")).toHaveLength(12);
    // The first wisp is spent a second in; the second still has a third to go.
    for (let index = 0; index < 40; index += 1) frame(values);
    recording.clear();
    frame(values);
    expect(recording.callsTo("stroke")).toHaveLength(6);
    for (let index = 0; index < 25; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});

describe("Spark Shower", () => {
  it("throws Sparks streaks per Cue, flips with Upward, and clears at its Lifetime", () => {
    const { cue, frame, recording } = canvas(sparkShower);
    const values = { automaticRate: 0, sparks: 10, lifetime: 500 };
    expect(frame(values).blank).toBe(true);
    cue("shower");
    recording.clear();
    expect(frame(values)).toMatchObject({ blank: false, rendered: true });
    expect(recording.callsTo("stroke")).toHaveLength(10);
    const down = recording
      .callsTo("lineTo")
      .map((call) => Number(call.args[1]));
    recording.clear();
    frame({ ...values, upward: true });
    const up = recording.callsTo("lineTo").map((call) => Number(call.args[1]));
    // Down starts just above the Surface and falls into it; Upward starts
    // just below and rises, so the two sprays never share a half.
    expect(Math.max(...down)).toBeLessThan(HEIGHT * 0.3);
    expect(Math.min(...up)).toBeGreaterThan(HEIGHT * 0.7);
    cue("shower");
    recording.clear();
    frame(values);
    expect(recording.callsTo("stroke")).toHaveLength(20);
    for (let index = 0; index < 31; index += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    expect(firesByItself(frame, { automaticRate: 8 })).toBe(true);
  });
});
