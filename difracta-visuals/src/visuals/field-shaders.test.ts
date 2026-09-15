import type { NumberParameter } from "@difracta/core";
import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { crtGlitch } from "./crt-glitch.ts";
import { flame } from "./flame.ts";
import { lavaLamp } from "./lava-lamp.ts";
import { nebula } from "./nebula.ts";
import { netherPortal } from "./nether-portal.ts";
import { plasmaTurbulence } from "./plasma-turbulence.ts";
import { smoke } from "./smoke.ts";
import { sunSurface } from "./sun-surface.ts";
import { synthHorizon } from "./synth-horizon.ts";

const DT = 1 / 60;

/** The nine noise and signal fields, all of them driven by one Speed. */
const FIELDS: readonly ShaderVisual[] = [
  crtGlitch,
  flame,
  lavaLamp,
  nebula,
  netherPortal,
  plasmaTurbulence,
  smoke,
  sunSurface,
  synthHorizon,
];

/** The clock each Visual reports, and how far it turns per second at Speed 1. */
const CLOCKS: Readonly<Record<string, readonly [string, number]>> = {
  "crt-glitch": ["time", 1],
  flame: ["time", 1],
  "lava-lamp": ["time", 1],
  nebula: ["drift", 0.05],
  "nether-portal": ["time", 1],
  "plasma-turbulence": ["time", 1],
  smoke: ["time", 1],
  "sun-surface": ["time", 1],
  "synth-horizon": ["time", 1],
};

/** A Parameter edit that changes the picture without touching the clock. */
const EDITS: Readonly<Record<string, Record<string, unknown>>> = {
  "crt-glitch": { scanlinePitch: 8 },
  flame: { detail: 5 },
  "lava-lamp": { blobs: 3 },
  nebula: { cloudScale: 4 },
  "nether-portal": { levels: 4 },
  "plasma-turbulence": { scale: 6 },
  smoke: { scale: 5 },
  "sun-surface": { contrast: 2 },
  "synth-horizon": { gridScale: 2 },
};

function player(visual: ShaderVisual) {
  const instance = createShaderPlayer(visual, {
    width: 320,
    height: 180,
    seed: "test",
  });
  return (values: Record<string, unknown> = {}, dt = DT) =>
    instance.frame(dt, values as never, 320, 180);
}

function clockOf(visual: ShaderVisual, result: { uniforms: object }): number {
  const [name] = CLOCKS[visual.id] ?? ["time", 1];
  return (result.uniforms as Record<string, number>)[name] ?? Number.NaN;
}

describe("field shader Visuals", () => {
  it.each(FIELDS)(
    "$id paints from uniforms and never samples the clock",
    (visual) => {
      expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
      // Every clock lives in the instance: the GLSL only reads what it hands over.
      expect(visual.fragment).not.toContain("u_elapsed_seconds");
      expect(visual.fragment).not.toContain("u_random_seed");
      expect(visual.fragment).not.toContain("u_visual_resolution");
    },
  );

  it.each(FIELDS)(
    "$id declares no uniform named after a Parameter",
    (visual) => {
      const declared = [
        ...visual.fragment.matchAll(/^uniform\s+\w+\s+(u_\w+)\s*;/gm),
      ].map((match) => match[1] ?? "");
      expect(declared.length).toBeGreaterThan(0);
      const parameters = Object.keys(visual.parameters).map(
        (key) => `u_${key}`,
      );
      expect(declared.filter((name) => parameters.includes(name))).toEqual([]);
    },
  );

  it.each(FIELDS)(
    "$id integrates its clock, so a Speed change never jumps",
    (visual) => {
      const frame = player(visual);
      const [, rate] = CLOCKS[visual.id] ?? ["time", 1];
      // A Layer may start its clock anywhere; only what a frame adds is fixed.
      const start = clockOf(visual, frame({ speed: 1 }));
      const slow = clockOf(visual, frame({ speed: 1 }));
      expect(slow - start).toBeCloseTo(DT * rate, 6);
      // Trebling Speed advances the clock faster from where it already stood.
      const fast = clockOf(visual, frame({ speed: 3 }));
      expect(fast - slow).toBeCloseTo(3 * DT * rate, 6);
    },
  );

  it.each(FIELDS)(
    "$id rests when Speed is zero and wakes on an edit",
    (visual) => {
      const frame = player(visual);
      frame({ speed: 0 });
      expect(frame({ speed: 0 }).changed).toBe(false);
      const still = clockOf(visual, frame({ speed: 0 }));
      expect(frame({ speed: 0, ...EDITS[visual.id] }).changed).toBe(true);
      // A still picture is still still: the edit did not move the clock.
      expect(
        clockOf(visual, frame({ speed: 0, ...EDITS[visual.id] })),
      ).toBeCloseTo(still, 6);
    },
  );

  it.each(FIELDS)(
    "$id reports blank only when there is nothing to draw",
    (visual) => {
      const frame = player(visual);
      expect(frame({ speed: 1 }).blank).toBe(false);
    },
  );
});

describe("blank field Visuals", () => {
  const CLEAR = [0, 0, 0, 0] as const;
  it.each([
    { visual: flame, values: { flame: CLEAR } },
    { visual: lavaLamp, values: { background: CLEAR, size: 0 } },
    { visual: nebula, values: { deep: CLEAR, starDensity: 0 } },
    {
      visual: netherPortal,
      values: { shadow: CLEAR, portal: CLEAR, glow: CLEAR },
    },
    {
      visual: plasmaTurbulence,
      values: { background: CLEAR, colorA: CLEAR, colorB: CLEAR },
    },
    {
      visual: smoke,
      values: { background: CLEAR, colorA: CLEAR, colorB: CLEAR },
    },
    { visual: sunSurface, values: { base: CLEAR, body: CLEAR, hot: CLEAR } },
  ])(
    "$visual.id goes blank when every color it draws is clear",
    ({ visual, values }) => {
      const frame = player(visual);
      expect(frame({ speed: 1 }).blank).toBe(false);
      expect(frame({ speed: 1, ...values }).blank).toBe(true);
    },
  );
});

describe("CRT Glitch", () => {
  it("drives Tear and Glitch apart and spaces scanlines in Output pixels", () => {
    expect(crtGlitch.fragment).toContain("jitter * u_tear");
    expect(crtGlitch.fragment).toContain("step(1.0 - u_glitch * 0.12");
    // The ruling is a pitch in pixels, not a frequency tied to the resolution.
    expect(crtGlitch.fragment).toContain(
      "u_resolution.y / max(2.0, u_scanlinePitch)",
    );
    expect(crtGlitch.parameters.scanlinePitch.min).toBe(2);
  });
});

describe("Nebula", () => {
  it("keeps the stars on the same clock as the gas, so Drift Speed stops both", () => {
    const frame = player(nebula);
    frame({ speed: 1 });
    const first = frame({ speed: 1 }).uniforms.twinkle as number;
    const second = frame({ speed: 1 }).uniforms.twinkle as number;
    expect(second - first).toBeCloseTo(DT, 6);
    frame({ speed: 0 });
    const held = frame({ speed: 0 });
    expect(held.changed).toBe(false);
    expect(frame({ speed: 0 }).uniforms.twinkle).toBe(held.uniforms.twinkle);
  });
});

function numberParameter(visual: ShaderVisual, key: string): NumberParameter {
  const definition = visual.parameters[key];
  expect(definition?.kind).toBe("number");
  return definition as NumberParameter;
}

describe("pixel Parameters", () => {
  it.each([
    { visual: crtGlitch, key: "scanlinePitch" },
    { visual: netherPortal, key: "pixelSize" },
  ])("keeps $key in pixels rather than as a fraction", ({ visual, key }) => {
    const definition = numberParameter(visual, key);
    expect(definition.unit).toBe("px");
    expect(definition.percent).toBeUndefined();
  });
});
