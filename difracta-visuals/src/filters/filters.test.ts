import { createFilterPlayer, type ShaderFilter } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { blockGlitch } from "./block-glitch.ts";
import { chromaticAberration } from "./chromatic-aberration.ts";
import { dither } from "./dither.ts";
import { impactShake } from "./impact-shake.ts";
import { pixelCrush } from "./pixel-crush.ts";
import { punchZoom } from "./punch-zoom.ts";
import { rollingTvTear } from "./rolling-tv-tear.ts";
import { scanlines } from "./scanlines.ts";
import { signalDistortion } from "./signal-distortion.ts";
import { sliceShift } from "./slice-shift.ts";
import { tileScramble } from "./tile-scramble.ts";
import { waveDistortion } from "./wave-distortion.ts";

const DT = 1 / 60;

function player(filter: ShaderFilter) {
  const instance = createFilterPlayer(filter, {
    width: 960,
    height: 540,
    seed: "test",
  });
  return (values: Record<string, unknown>, dt = DT) =>
    instance.frame(dt, values as never, 960, 540);
}

const everyFilter = [
  tileScramble,
  impactShake,
  signalDistortion,
  dither,
  scanlines,
  chromaticAberration,
  waveDistortion,
  rollingTvTear,
  blockGlitch,
  punchZoom,
  pixelCrush,
  sliceShift,
];

describe("every Filter", () => {
  it.each(everyFilter.map((filter) => ({ filter })))(
    "$filter.id defines filter_image",
    ({ filter }) => {
      expect(filter.fragment).toContain("vec4 filter_image(vec2 uv)");
    },
  );

  // Dither is the one Filter with no off state: at every Color Levels it still
  // quantizes, so easing it in is the Layer's Mix, not a Parameter of its own.
  it.each([
    { filter: tileScramble, off: { amount: 0 } },
    { filter: impactShake, off: { amount: 0 } },
    {
      filter: signalDistortion,
      off: { amount: 0, rgbSplit: 0 },
    },
    { filter: scanlines, off: { strength: 0 } },
    { filter: chromaticAberration, off: { amount: 0 } },
    { filter: waveDistortion, off: { amount: 0 } },
    { filter: rollingTvTear, off: { amount: 0 } },
    { filter: blockGlitch, off: { amount: 0 } },
    { filter: punchZoom, off: { amount: 0 } },
    { filter: pixelCrush, off: { size: 1 } },
    { filter: sliceShift, off: { amount: 0 } },
  ])("$filter.id passes through with nothing to do", ({ filter, off }) => {
    expect(filter.fragment).toContain("vec4 filter_image(vec2 uv)");
    const frame = player(filter);
    expect(frame(off).identity).toBe(true);
    expect(frame({}).identity).toBe(false);
  });

  it("Dither never reports identity, whatever its Parameters", () => {
    const frame = player(dither);
    expect(frame({ levels: 2 }).identity).toBe(false);
    expect(frame({ levels: 16, monochrome: false }).identity).toBe(false);
  });
});

describe("Tile Scramble", () => {
  it("reshuffles once per tick of Rate and is still in between", () => {
    const frame = player(tileScramble);
    const generations: number[] = [];
    const changes: boolean[] = [];
    // 61 frames at 6 Hz: the sixth tick lands just past the last one.
    for (let i = 0; i < 61; i += 1) {
      const result = frame({ rate: 6 });
      generations.push(result.uniforms.generation as number);
      changes.push(result.changed);
    }
    expect(generations.at(-1)).toBe(6);
    expect(changes.filter(Boolean)).toHaveLength(7); // the first frame, then each tick
    // A Rate change carries the progress toward the next tick: no skip, no repeat.
    const before = generations.at(-1)!;
    const slow = frame({ rate: 1 });
    expect(slow.uniforms.generation).toBe(before);
    expect(slow.changed).toBe(true); // the Parameter changed
    expect(frame({ rate: 1 }).changed).toBe(false);
  });
});

describe("Impact Shake", () => {
  it("holds still for most of a tick, then moves to a new spot within reach", () => {
    const frame = player(impactShake);
    const offsets = Array.from({ length: 30 }, () => {
      const { uniforms, changed } = frame({ rate: 2, amount: 1 });
      return { offset: uniforms.offset as readonly [number, number], changed };
    });
    // 30 frames at 2 Hz is one tick; the hold lasts 65% of it.
    expect(offsets.slice(1, 19).every((o) => !o.changed)).toBe(true);
    expect(offsets.slice(21).some((o) => o.changed)).toBe(true);
    for (const { offset } of offsets) {
      expect(Math.abs(offset[0])).toBeLessThanOrEqual(0.16);
      expect(Math.abs(offset[1])).toBeLessThanOrEqual(0.16);
    }
    const [x, y] = offsets.at(-1)!.offset;
    expect(x !== 0 || y !== 0).toBe(true);
  });
});

describe("Signal Distortion", () => {
  it("advances its phase by Speed and freezes at zero", () => {
    const frame = player(signalDistortion);
    frame({ speed: 12 });
    const second = frame({ speed: 12 });
    expect(second.uniforms.fine_phase).toBeCloseTo((2 * 12) / 60, 6);
    expect(second.uniforms.coarse_phase).toBeCloseTo(((2 * 12) / 60) * 0.37, 6);
    expect(second.changed).toBe(true);
    frame({ speed: 0 });
    const frozen = frame({ speed: 0 });
    expect(frozen.changed).toBe(false);
    expect(frozen.uniforms.fine_phase).toBeCloseTo((2 * 12) / 60, 6);
  });
});

describe("Wave Distortion", () => {
  it("travels by Speed, reverses without a jump, and freezes at zero", () => {
    const frame = player(waveDistortion);
    frame({ speed: 1 });
    const second = frame({ speed: 1 });
    expect(second.uniforms.phase).toBeCloseTo(2 / 60, 6);
    expect(second.changed).toBe(true);
    // Reversing carries the phase on rather than restarting it.
    expect(frame({ speed: -1 }).uniforms.phase).toBeCloseTo(1 / 60, 6);
    frame({ speed: 0 });
    const still = frame({ speed: 0 });
    expect(still.changed).toBe(false);
    expect(still.uniforms.phase).toBeCloseTo(1 / 60, 6);
    // The phase stays inside one cycle however long it runs.
    for (let i = 0; i < 600; i += 1) frame({ speed: 5 });
    const late = frame({ speed: 5 }).uniforms.phase as number;
    expect(late).toBeGreaterThanOrEqual(0);
    expect(late).toBeLessThan(1);
  });

  it("pins the order of its Direction options, which the fragment reads by index", () => {
    expect(
      waveDistortion.parameters.direction.options.map((o) => o.value),
    ).toEqual(["horizontal", "vertical"]);
    expect(waveDistortion.fragment).toContain("u_direction == 0 ? uv.y : uv.x");
  });
});

describe("Rolling TV Tear", () => {
  it("rolls the band by Speed, wraps it, and parks it at zero", () => {
    const frame = player(rollingTvTear);
    frame({ speed: 0.5 });
    const second = frame({ speed: 0.5 });
    expect(second.uniforms.center).toBeCloseTo(2 / 120, 6);
    expect(second.changed).toBe(true);
    // A Speed change moves the band on from where it is, never back to the top.
    const before = second.uniforms.center as number;
    expect(frame({ speed: 2 }).uniforms.center).toBeCloseTo(before + 2 / 60, 6);
    frame({ speed: 0 });
    const parked = frame({ speed: 0 });
    expect(parked.changed).toBe(false);
    for (let i = 0; i < 600; i += 1) frame({ speed: 2 });
    const late = frame({ speed: 2 }).uniforms.center as number;
    expect(late).toBeGreaterThanOrEqual(0);
    expect(late).toBeLessThan(1);
  });
});

describe("Punch Zoom", () => {
  it("hits on the tick, eases back, and carries the recovery through a Rate change", () => {
    const frame = player(punchZoom);
    const zooms = Array.from(
      { length: 45 },
      () => frame({ rate: 2, amount: 1 }).uniforms.zoom as number,
    );
    // The recovery only ever falls, until the next tick throws it back in.
    expect(zooms[1]).toBeLessThan(zooms[0]!);
    expect(zooms[10]).toBeLessThan(zooms[1]!);
    const rebound = zooms.findIndex((z, i) => i > 0 && z > zooms[i - 1]!);
    expect(rebound).toBeGreaterThan(20);
    expect(rebound).toBeLessThan(40);
    // Speeding up only brings the next punch closer: the picture does not jump.
    const before = zooms.at(-1)!;
    const after = frame({ rate: 8, amount: 1 }).uniforms.zoom as number;
    expect(Math.abs(after - before)).toBeLessThan(0.5);
    // Rate zero leaves the resting zoom alone and costs nothing.
    frame({ rate: 0, amount: 0.5 });
    const resting = frame({ rate: 0, amount: 0.5 });
    expect(resting.uniforms.zoom).toBeCloseTo(1.2, 6);
    expect(resting.changed).toBe(false);
  });
});

describe("tick-driven Filters", () => {
  it.each([blockGlitch, sliceShift])(
    "$id re-rolls once per tick of Rate and is still in between",
    (filter) => {
      const frame = player(filter);
      const generations: number[] = [];
      const changes: boolean[] = [];
      // 61 frames at 6 Hz: the sixth tick lands just past the last one.
      for (let i = 0; i < 61; i += 1) {
        const result = frame({ rate: 6 });
        generations.push(result.uniforms.generation as number);
        changes.push(result.changed);
      }
      expect(generations.at(-1)).toBe(6);
      expect(changes.filter(Boolean)).toHaveLength(7);
      // A Rate change carries the progress toward the next tick: no skip.
      const before = generations.at(-1)!;
      const slow = frame({ rate: 1 });
      expect(slow.uniforms.generation).toBe(before);
      expect(slow.changed).toBe(true); // the Parameter changed
      expect(frame({ rate: 1 }).changed).toBe(false);
    },
  );
});
