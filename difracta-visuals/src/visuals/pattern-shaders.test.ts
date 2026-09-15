import { createShaderPlayer, type ShaderVisual } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { bladeCross } from "./blade-cross.ts";
import { lightSweep } from "./light-sweep.ts";
import { neonLattice } from "./neon-lattice.ts";
import { noiseField } from "./noise-field.ts";
import { orbitalArcs } from "./orbital-arcs.ts";
import { prismInterference } from "./prism-interference.ts";
import { ribbonCurrent } from "./ribbon-current.ts";
import { rotor } from "./rotor.ts";
import { shutter } from "./shutter.ts";

const DT = 1 / 60;
const CLEAR: Record<string, unknown> = {
  colorA: [0, 0, 0, 0],
  colorB: [0, 0, 0, 0],
  background: [0, 0, 0, 0],
  color: [0, 0, 0, 0],
  noise: [0, 0, 0, 0],
};

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

/** Every one of the nine paints with uniforms alone and declares its notes. */
describe.each([
  bladeCross,
  rotor,
  orbitalArcs,
  ribbonCurrent,
  lightSweep,
  shutter,
  noiseField,
  prismInterference,
  neonLattice,
])("$id", (visual) => {
  it("paints from uniforms and never reads a clock in GLSL", () => {
    expect(visual.fragment).toContain("vec4 render_visual(vec2 uv)");
    expect(visual.fragment).not.toContain("u_elapsed_seconds");
    expect(visual.fragment).not.toContain("u_random_seed");
    expect(visual.fragment).not.toContain("u_visual_resolution");
    expect(visual.notes ?? "").not.toBe("");
  });

  it("declares no uniform that shadows one of its Parameters", () => {
    const declared = [
      ...visual.fragment.matchAll(/uniform\s+\w+\s+u_(\w+)/g),
    ].map((match) => match[1]);
    for (const name of declared)
      expect(Object.keys(visual.parameters)).not.toContain(name);
  });

  it("goes blank when every color it paints with is transparent", () => {
    const { frame } = shader(visual);
    const values = Object.fromEntries(
      Object.keys(visual.parameters)
        .filter((name) => name in CLEAR)
        .map((name) => [name, CLEAR[name]]),
    );
    frame(values);
    expect(frame(values).blank).toBe(true);
  });
});

/** The four that turn: one clock, integrated from Speed, at rest at zero. */
describe.each([
  { visual: bladeCross, uniform: "time" },
  { visual: rotor, uniform: "angle" },
  { visual: orbitalArcs, uniform: "time" },
  { visual: ribbonCurrent, uniform: "time" },
])("$visual.id", ({ visual, uniform }) => {
  it("integrates its clock from Speed and rests at zero", () => {
    const { frame } = shader(visual);
    const start = frame({ speed: 1 }).uniforms[uniform] as number;
    const next = frame({ speed: 1 }).uniforms[uniform] as number;
    expect(next - start).toBeCloseTo(1 / 60, 6);
    // Halving Speed halves the next step; it never re-derives where it is.
    const slower = frame({ speed: 0.5 }).uniforms[uniform] as number;
    expect(slower - next).toBeCloseTo(0.5 / 60, 6);
    frame({ speed: 0 });
    const still = frame({ speed: 0 });
    expect(still.changed).toBe(false);
    expect(still.uniforms[uniform]).toBeCloseTo(slower, 6);
    expect(frame({ speed: 0, colorA: [0.5, 0.25, 0.75, 1] }).changed).toBe(
      true,
    );
  });
});

describe("Blade Cross", () => {
  it("caps Blades at the fragment's loop", () => {
    const blades = bladeCross.parameters.blades;
    expect(blades.kind === "number" && blades.max).toBe(16);
    expect(bladeCross.fragment).toContain("index < 16");
  });
});

describe("Rotor", () => {
  it("cuts its centre out at Centre Hole rather than a fixed radius", () => {
    expect(rotor.fragment).toContain("smoothstep(u_hub, u_hub + 0.1, radius)");
  });
});

describe("Light Sweep", () => {
  it("spaces its free-running sweeps evenly and carries them past a Speed change", () => {
    const { frame } = shader(lightSweep);
    const span = 1 + 0.12 + 0.3;
    const head = (values: Record<string, unknown>): number =>
      (frame(values).uniforms.heads as Float32Array)[0]!;
    const two = frame({ speed: 1, count: 2, width: 0.12, trail: 0.3 });
    expect(two.uniforms.head_count).toBe(2);
    const heads = two.uniforms.heads as Float32Array;
    // Two sweeps sit half a crossing apart, wherever the phase happens to be.
    const gap = Math.abs(heads[0]! - heads[1]!);
    expect(Math.min(gap, span - gap)).toBeCloseTo(span * 0.5, 4);
    const before = head({ speed: 1, count: 1 });
    const after = head({ speed: 4, count: 1 });
    // A Speed change moves it on by the new step; it does not teleport.
    expect(((after - before) % span) + (after < before ? span : 0)).toBeCloseTo(
      (span * 4) / 60,
      4,
    );
  });

  it("is blank with no sweeps, and its Cue launches one that travels and retires", () => {
    const { cue, frame } = shader(lightSweep);
    frame({ count: 0, speed: 1 });
    const empty = frame({ count: 0, speed: 1 });
    expect(empty.blank).toBe(true);
    expect(empty.changed).toBe(false);
    cue("sweep");
    const fired = frame({ count: 0, speed: 1 });
    expect(fired).toMatchObject({ blank: false, changed: true });
    expect(fired.uniforms.head_count).toBe(1);
    for (let i = 0; i < 61; i += 1) frame({ count: 0, speed: 1 });
    expect(frame({ count: 0, speed: 1 }).blank).toBe(true);
  });
});

describe("Shutter", () => {
  it("integrates its cycle from Speed, snaps shut on its Cue and rests at zero", () => {
    const { cue, frame } = shader(shutter);
    frame({ speed: 1 });
    const first = frame({ speed: 1 }).uniforms.cycle as number;
    const second = frame({ speed: 1 }).uniforms.cycle as number;
    expect(second).not.toBe(first);
    frame({ speed: 0 });
    const still = frame({ speed: 0 });
    expect(still.changed).toBe(false);
    cue("close");
    const shut = frame({ speed: 0 });
    // Fully shut is cycle zero, and the snap is reported even while stopped.
    expect(shut.uniforms.cycle).toBeCloseTo(0, 6);
    expect(shut.changed).toBe(true);
    expect(frame({ speed: 0 }).changed).toBe(false);
  });
});

describe("Noise Field", () => {
  it("re-rolls once per tick of Rate and holds one generation at zero", () => {
    const { frame } = shader(noiseField);
    for (let i = 0; i < 61; i += 1) frame({ rate: 6 });
    expect(frame({ rate: 6 }).uniforms.generation).toBe(6);
    frame({ rate: 0 });
    expect(frame({ rate: 0 }).changed).toBe(false);
    expect(frame({ rate: 0, density: 0.25 }).changed).toBe(true);
  });

  it("carries the part-tick through a live Rate change, skipping and repeating none", () => {
    const { frame } = shader(noiseField);
    const seen: number[] = [];
    for (let i = 0; i < 180; i += 1)
      seen.push(frame({ rate: i < 60 ? 6 : 30 }).uniforms.generation as number);
    for (let i = 1; i < seen.length; i += 1) {
      const step = seen[i]! - seen[i - 1]!;
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(1);
    }
    // Sixty frames at six hertz then a hundred and twenty at thirty: six then sixty.
    expect(seen.at(-1)).toBeGreaterThanOrEqual(64);
    expect(seen.at(-1)).toBeLessThanOrEqual(66);
  });

  it("keeps Grain Size in Output pixels", () => {
    const grain = noiseField.parameters.grainSize;
    expect(grain.kind === "number" && grain.unit).toBe("px");
    expect(noiseField.fragment).toContain(
      "uv * u_resolution / max(u_grainSize",
    );
  });
});

describe("Prism Interference", () => {
  it("rules its scanline at a pixel pitch and drifts from Drift Speed", () => {
    const pitch = prismInterference.parameters.scanlinePitch;
    expect(pitch.kind === "number" && pitch.unit).toBe("px");
    expect(pitch.kind === "number" && pitch.min).toBe(2);
    expect(prismInterference.fragment).toContain(
      "u_resolution.y / max(u_scanlinePitch",
    );
    const { frame } = shader(prismInterference);
    const start = frame({ speed: 1 }).uniforms.time as number;
    expect((frame({ speed: 1 }).uniforms.time as number) - start).toBeCloseTo(
      1 / 60,
      6,
    );
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
  });
});

describe("Neon Lattice", () => {
  it("names its colors for what they do and bounds its raymarch", () => {
    expect(neonLattice.parameters.colorA.label).toBe("Color A");
    expect(neonLattice.parameters.colorB.label).toBe("Color B");
    const steps = neonLattice.parameters.steps;
    expect(steps.kind === "number" && steps.max).toBe(96);
    expect(neonLattice.fragment).toContain("index < 96");
    expect(neonLattice.fragment).toContain("float(index) >= u_steps");
  });

  it("integrates its flight and rests at zero", () => {
    const { frame } = shader(neonLattice);
    const start = frame({ speed: 1 }).uniforms.time as number;
    expect((frame({ speed: 1 }).uniforms.time as number) - start).toBeCloseTo(
      1 / 60,
      6,
    );
    frame({ speed: 0 });
    expect(frame({ speed: 0 }).changed).toBe(false);
  });
});
