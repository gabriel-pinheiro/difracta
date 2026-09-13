import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import {
  FIGURES,
  GOBO_OPTIONS,
  movingHeadSpot,
  PRISM_OPTIONS,
} from "./moving-head-spot.ts";
import { starField } from "./star-field.ts";

const DT = 1 / 60;

function shader(visual: ShaderVisual) {
  const player = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
  });
  return {
    cue: (key: string) => player.cue(key),
    frame: (values: Record<string, unknown> = {}, dt = DT) =>
      player.frame(dt, values as never, 320, 180),
  };
}

describe("Star Field", () => {
  it("counts lifetimes and slides by Drift, both from Speed, and rests at zero", () => {
    const { frame } = shader(starField);
    const first = frame({ speed: 1, lifetime: 5, drift: 4 });
    const second = frame({ speed: 1, lifetime: 5, drift: 4 });
    const cycles =
      (second.uniforms.cycle as number) - (first.uniforms.cycle as number);
    expect(cycles).toBeCloseTo(1 / 60 / 5, 6);
    expect(
      (second.uniforms.slide as number) - (first.uniforms.slide as number),
    ).toBeCloseTo(4 / 60, 6);
    // A longer Lifetime slows the cycle from here; nothing is re-derived.
    const third = frame({ speed: 1, lifetime: 10, drift: 4 });
    expect(
      (third.uniforms.cycle as number) - (second.uniforms.cycle as number),
    ).toBeCloseTo(1 / 60 / 10, 6);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, brightness: 0 }).blank).toBe(true);
  });
});

describe("Moving Head Spot", () => {
  it("dispatches its choices on their index, so the option order is fixed", () => {
    expect(FIGURES.map((option) => option.value)).toEqual([
      "orbit",
      "infinity",
      "horizontal-sweep",
      "vertical-sweep",
      "diagonal-sweep",
      "diamond",
      "rounded-rectangle",
      "triangle",
      "clover",
      "spiral",
      "wander",
    ]);
    expect(GOBO_OPTIONS.map((option) => option.value)).toEqual([
      "open",
      "ring",
      "dot-cluster",
      "bars",
      "star",
      "pinwheel",
      "spiral",
      "breakup",
    ]);
    expect(PRISM_OPTIONS.map((option) => option.value)).toEqual([
      "off",
      "three-facet",
      "five-facet-linear",
      "six-facet-circular",
      "six-facet-linear",
      "eight-facet-circular",
    ]);
  });

  it("travels by Speed, offsets by Phase, and Bump restarts the figure", () => {
    const { cue, frame } = shader(movingHeadSpot);
    frame({ speed: 1 });
    expect(frame({ speed: 1 }).uniforms.progress).toBeCloseTo(2 / 60, 6);
    expect(frame({ speed: 1, phase: 0.5 }).uniforms.progress).toBeCloseTo(
      3 / 60 + 0.5,
      6,
    );
    cue("bump");
    expect(frame({ speed: 1 }).uniforms.progress).toBeCloseTo(1 / 60, 6);
    // A head with nothing moving costs nothing.
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, goboSpin: 1 }).changed).toBe(true);
    expect(frame({ speed: 0, goboSpin: 1 }).changed).toBe(true);
  });

  it("turns the gobo and shutters at the Strobe Rate, blank while shut", () => {
    const { frame } = shader(movingHeadSpot);
    const still = frame({ speed: 0, goboAngle: 90 });
    expect(still.uniforms.gobo_turn).toBeCloseTo(Math.PI / 2, 6);
    const spun = frame({ speed: 0, goboAngle: 90, goboSpin: 0.5 });
    expect(spun.uniforms.gobo_turn).toBeCloseTo(
      Math.PI / 2 + (0.5 / 60) * Math.PI * 2,
      6,
    );
    // 2 Hz: open for the first 35% of each 30-frame cycle.
    const open = Array.from(
      { length: 30 },
      () => !frame({ speed: 0, strobeRate: 2 }).blank,
    );
    expect(open.filter(Boolean)).toHaveLength(10);
    expect(open.slice(0, 10).every(Boolean)).toBe(true);
    expect(open.slice(11).some(Boolean)).toBe(false);
  });
});
