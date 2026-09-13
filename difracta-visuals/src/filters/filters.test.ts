import { createFilterPlayer, type ShaderFilter } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { impactShake } from "./impact-shake.ts";
import { signalDistortion } from "./signal-distortion.ts";
import { tileScramble } from "./tile-scramble.ts";

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

describe("every Filter", () => {
  it.each([
    { filter: tileScramble, off: { amount: 0 } },
    { filter: impactShake, off: { amount: 0 } },
    {
      filter: signalDistortion,
      off: { amount: 0, rgbSplit: 0 },
    },
  ])(
    "$filter.id defines filter_image and passes through with nothing to do",
    ({ filter, off }) => {
      expect(filter.fragment).toContain("vec4 filter_image(vec2 uv)");
      const frame = player(filter);
      expect(frame(off).identity).toBe(true);
      expect(frame({}).identity).toBe(false);
    },
  );
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
