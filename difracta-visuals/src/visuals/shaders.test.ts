import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { barcodeRunner } from "./barcode-runner.ts";
import { chevronFlight } from "./chevron-flight.ts";
import { contourDrift } from "./contour-drift.ts";
import { conveyor } from "./conveyor.ts";
import { gradient } from "./gradient.ts";
import { radialStreaks } from "./radial-streaks.ts";
import { spot } from "./spot.ts";
import { tunnel } from "./tunnel.ts";
import { waterCaustics } from "./water-caustics.ts";

const DT = 1 / 60;

function player(visual: ShaderVisual) {
  const instance = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
  });
  return (values: Record<string, unknown> = {}, dt = DT) =>
    instance.frame(dt, values as never, 320, 180);
}

describe("still shader Visuals", () => {
  it.each([
    { visual: gradient, edit: { type: "radial" } },
    { visual: spot, edit: { diameter: 0.5 } },
  ])(
    "$visual.id defines render_visual and redraws only when a Parameter changes",
    ({ visual, edit }) => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      expect("create" in visual).toBe(false);
      const frame = player(visual);
      expect(frame().changed).toBe(true);
      expect(frame().changed).toBe(false);
      expect(frame(edit).changed).toBe(true);
    },
  );
});

describe("Tunnel", () => {
  it("integrates travel and roll from Speed and Rotation and rests when both are zero", () => {
    const frame = player(tunnel);
    frame({ speed: 1, rotation: 0.5 });
    const second = frame({ speed: 1, rotation: 0.5 });
    expect(second.uniforms.travel).toBeCloseTo(2 / 60, 6);
    expect(second.uniforms.angle).toBeCloseTo(1 / 60, 6);
    expect(second.changed).toBe(true);
    // Travel wraps at one ring, the roll at a full turn, so neither grows forever.
    for (let i = 0; i < 120; i += 1) frame({ speed: 1, rotation: 0.5 });
    expect(frame({ speed: 1, rotation: 0.5 }).uniforms.travel).toBeLessThan(1);
    frame({ speed: 0, rotation: 0 });
    const still = frame({ speed: 0, rotation: 0 });
    expect(still.changed).toBe(false);
    // Reversing carries the phase on: no jump.
    const before = still.uniforms.travel as number;
    expect(frame({ speed: -1, rotation: 0 }).uniforms.travel).toBeCloseTo(
      before - 1 / 60,
      6,
    );
  });
});

describe("lane Visuals", () => {
  it.each([conveyor, chevronFlight, contourDrift, radialStreaks])(
    "$id runs its clock from Speed and rests at zero",
    (visual) => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      const frame = player(visual);
      const start = frame({ speed: 1 }).uniforms.time as number;
      const next = frame({ speed: 1 });
      expect(next.changed).toBe(true);
      expect(((next.uniforms.time as number) - start + 1) % 1).toBeCloseTo(
        1 / 60,
        6,
      );
      frame({ speed: 0 });
      const still = frame({ speed: 0 });
      expect(still.changed).toBe(false);
      expect(frame({ speed: 0, colorA: [1, 0, 0, 1] }).changed).toBe(true);
    },
  );
});

describe("Barcode Runner", () => {
  it("scrolls by Speed and re-rolls once per tick of Change Rate", () => {
    const frame = player(barcodeRunner);
    const generations: number[] = [];
    for (let i = 0; i < 61; i += 1)
      generations.push(
        frame({ speed: 0, changeRate: 6 }).uniforms.generation as number,
      );
    expect(generations.at(-1)).toBe(6);
    // Held still with nothing to re-roll, it costs nothing.
    frame({ speed: 0, changeRate: 0 });
    expect(frame({ speed: 0, changeRate: 0 }).changed).toBe(false);
    // Scrolling wraps at one Surface width, so the offset never grows.
    for (let i = 0; i < 200; i += 1) frame({ speed: 3, changeRate: 0 });
    const scroll = frame({ speed: 3, changeRate: 0 }).uniforms.scroll as number;
    expect(scroll).toBeGreaterThanOrEqual(0);
    expect(scroll).toBeLessThan(1);
  });
});

describe("Water Caustics", () => {
  it("flows by Speed, freezes at zero, and keeps its Layer seed", () => {
    const frame = player(waterCaustics);
    const first = frame({ speed: 0.5 });
    const seed = first.uniforms.seed;
    expect(seed).toBeGreaterThanOrEqual(0);
    const second = frame({ speed: 0.5 });
    expect(second.uniforms.time).toBeCloseTo(1 / 60, 6);
    expect(second.uniforms.seed).toBe(seed);
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
    expect(frame({ speed: 0, depthShade: 0 }).changed).toBe(true);
  });
});
