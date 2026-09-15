import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { checkerFlicker } from "./checker-flicker.ts";
import {
  LAYOUT_OPTIONS,
  PATTERN_OPTIONS,
  segmentStrobe,
} from "./segment-strobe.ts";
import { vortex } from "./vortex.ts";
import { DIRECTION_OPTIONS, SHAPE_OPTIONS, zoomRush } from "./zoom-rush.ts";

const DT = 1 / 60;
const CLEAR = [0, 0, 0, 0];

function shader(visual: ShaderVisual) {
  const player = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
  });
  return (values: Record<string, unknown> = {}, dt = DT) =>
    player.frame(dt, values as never, 320, 180);
}

/** Held on a pad: every press is a fresh instance that must show at once. */
describe.each([segmentStrobe, checkerFlicker, zoomRush, vortex])(
  "$id",
  (visual) => {
    it("paints from uniforms and declares its notes", () => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      expect(visual.notes ?? "").not.toBe("");
    });

    it("declares no uniform that shadows one of its Parameters", () => {
      const declared = [
        ...visual.fragment.matchAll(/uniform\s+\w+\s+u_(\w+)/g),
      ].map((match) => match[1]);
      for (const name of declared)
        expect(Object.keys(visual.parameters)).not.toContain(name);
    });

    it("shows on its first frame", () => {
      const first = shader(visual)();
      expect(first.blank).toBe(false);
      expect(first.changed).toBe(true);
    });

    it("goes blank when every color it paints with is transparent", () => {
      const frame = shader(visual);
      const colors = Object.fromEntries(
        Object.entries(visual.parameters)
          .filter(
            ([, parameter]) => (parameter as { kind: string }).kind === "color",
          )
          .map(([name]) => [name, CLEAR]),
      );
      expect(frame(colors).blank).toBe(true);
    });
  },
);

describe("option order, which the fragments dispatch on", () => {
  it("is pinned", () => {
    expect(LAYOUT_OPTIONS.map((option) => option.value)).toEqual([
      "columns",
      "rows",
      "grid",
    ]);
    expect(PATTERN_OPTIONS.map((option) => option.value)).toEqual([
      "chase",
      "bounce",
      "random",
      "alternate",
      "all",
    ]);
    expect(SHAPE_OPTIONS.map((option) => option.value)).toEqual([
      "square",
      "circle",
      "diamond",
    ]);
    expect(DIRECTION_OPTIONS.map((option) => option.value)).toEqual([
      "outward",
      "inward",
    ]);
  });
});

describe("Segment Strobe", () => {
  it("steps at Rate, keeps each step while it glows, and holds still once dry", () => {
    const frame = shader(segmentStrobe);
    const dry = { rate: 2, flashDuration: 40, afterglow: 0 };
    expect(frame(dry).uniforms.age_count).toBe(1);
    for (let i = 0; i < 6; i += 1) frame(dry);
    const dark = frame(dry);
    expect(dark.blank).toBe(true);
    expect(frame(dry).changed).toBe(false);
    // Half a second in, the next step fires.
    let step = 0;
    for (let i = 0; i < 30 && step === 0; i += 1)
      step = frame(dry).uniforms.step as number;
    expect(step).toBe(1);
    // An afterglow keeps steps in flight and redraws while they fade.
    const glowing = { rate: 20, flashDuration: 20, afterglow: 300 };
    let result = frame(glowing);
    for (let i = 0; i < 30; i += 1) result = frame(glowing);
    expect(result.uniforms.age_count).toBeGreaterThan(4);
    expect(result.changed).toBe(true);
  });

  it("sizes a grid to keep the cells near square", () => {
    const frame = shader(segmentStrobe);
    expect(frame({ layout: "columns", segments: 8 }).uniforms.grid).toEqual([
      8, 1,
    ]);
    expect(frame({ layout: "rows", segments: 8 }).uniforms.grid).toEqual([
      1, 8,
    ]);
    expect(frame({ layout: "grid", segments: 8 }).uniforms.grid).toEqual([
      8, 5,
    ]);
  });
});

describe("Checker Flicker", () => {
  it("swaps at Rate, punches on a swap and settles still at Rate zero", () => {
    const frame = shader(checkerFlicker);
    const first = frame({ rate: 4, pump: 0.5 });
    expect(first.uniforms.zoom).toBeGreaterThan(1);
    const flipped = first.uniforms.flipped;
    let swapped = false;
    for (let i = 0; i < 20 && !swapped; i += 1)
      swapped = frame({ rate: 4, pump: 0.5 }).uniforms.flipped !== flipped;
    expect(swapped).toBe(true);
    const still = { rate: 0, pump: 0.5, rotation: 0 };
    for (let i = 0; i < 30; i += 1) frame(still);
    const settled = frame(still);
    expect(settled.uniforms.zoom).toBe(1);
    expect(settled.changed).toBe(false);
  });
});

describe.each([
  { visual: zoomRush, uniform: "travel", speed: "speed" },
  { visual: vortex, uniform: "crawl", speed: "pull" },
])("$visual.id", ({ visual, uniform, speed }) => {
  const read = (result: ReturnType<ReturnType<typeof shader>>): number =>
    result.uniforms[uniform] as number;

  it("integrates its speed, and costs nothing stopped", () => {
    const frame = shader(visual);
    const stopped = { [speed]: 0, spin: 0 };
    frame(stopped);
    const before = read(frame(stopped));
    const after = frame(stopped);
    expect(read(after)).toBe(before);
    expect(after.changed).toBe(false);
  });

  it("speeds up the longer it is held when Acceleration is set", () => {
    const steady = shader(visual);
    const accelerating = shader(visual);
    const values = { [speed]: 0.5, spin: 0 };
    const stepOf = (frame: ReturnType<typeof shader>, acceleration: number) => {
      for (let i = 0; i < 60; i += 1) frame({ ...values, acceleration });
      const a = read(frame({ ...values, acceleration }));
      const b = read(frame({ ...values, acceleration }));
      return b - a;
    };
    expect(stepOf(accelerating, 1)).toBeGreaterThan(stepOf(steady, 0) * 1.5);
  });
});

describe("Zoom Rush", () => {
  it("runs the other way inward", () => {
    const frame = shader(zoomRush);
    frame({ direction: "inward", speed: 0.5 });
    const a = frame({ direction: "inward", speed: 0.5 }).uniforms
      .travel as number;
    const b = frame({ direction: "inward", speed: 0.5 }).uniforms
      .travel as number;
    expect(b).toBeLessThan(a);
  });
});
