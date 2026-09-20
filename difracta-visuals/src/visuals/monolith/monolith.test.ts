import { createShaderPlayer, resolveParameters } from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { packAssembly, ROWS, SLABS, waveAt } from "./assembly.ts";
import { createDirector, WAVE_LIFETIME } from "./director.ts";
import { monolith } from "./monolith.ts";
import { monolithParameters, type MonolithValues } from "./parameters.ts";

const DT = 1 / 60;
const values = (overrides: Partial<MonolithValues> = {}) =>
  resolveParameters(monolithParameters, overrides);

function show(overrides: Partial<MonolithValues> = {}) {
  let params = values(overrides);
  const director = createDirector(params);
  const play = (seconds: number, changes: Partial<MonolithValues> = {}) => {
    params = { ...params, ...changes };
    let look = director.advance(0, params);
    for (let i = 0; i < Math.round(seconds / DT); i += 1)
      look = director.advance(DT, params);
    return look;
  };
  return { cue: (key: string) => director.cue(key), play };
}

describe("Monolith performance", () => {
  it("seals a Build, holds the peak and ignores repeated Build until another section", () => {
    const live = show({ buildDuration: 4 });
    live.cue("build");
    expect(live.play(2).buildProgress).toBeCloseTo(0.5);
    live.cue("build");
    const peak = live.play(4);
    expect(peak.buildProgress).toBe(1);
    expect(peak.tension).toBeGreaterThan(0.99);
    expect(peak.opening).toBeLessThan(0.005);
    const held = live.play(30);
    expect(held.section).toBe("build");
    expect(held.buildProgress).toBe(1);
    live.cue("calm");
    live.cue("build");
    expect(live.play(DT).buildProgress).toBeLessThan(0.01);
  });

  it("opens quickly on Drop and sustains the expanded show after the hit expires", () => {
    const live = show();
    live.cue("build");
    live.play(12);
    live.cue("drop");
    const hit = live.play(0.15);
    expect(hit.opening).toBeGreaterThan(0.35);
    expect(hit.flash).toBeGreaterThan(0);
    expect(hit.impact).toBeGreaterThan(0.5);
    const ongoing = live.play(20);
    expect(ongoing.section).toBe("drop");
    expect(ongoing.opening).toBeGreaterThan(0.8);
    expect(ongoing.flash).toBe(0);
    expect(ongoing.impact).toBe(0);
    live.cue("breakdown");
    const quiet = live.play(8);
    expect(quiet.opening).toBeLessThan(0.02);
    expect(quiet.solo).toBeGreaterThan(0.99);
    live.cue("calm");
    const calm = live.play(10);
    expect(calm.solo).toBeLessThan(0.001);
    expect(calm.opening).toBeCloseTo(show().play(1).opening, 4);
  });

  it("makes Flash and Strobe identical without changing section", () => {
    const a = show();
    const b = show();
    a.cue("build");
    b.cue("build");
    a.play(2);
    b.play(2);
    a.cue("flash");
    b.cue("strobe");
    expect(a.play(DT)).toEqual(b.play(DT));
    expect(a.play(2)).toMatchObject({ section: "build", flash: 0 });
  });

  it("carries Kick waves together and releases every event after it fades", () => {
    const live = show();
    for (let i = 0; i < 100; i += 1) {
      live.cue("kick");
      live.play(0.1);
    }
    const overlap = live.play(0);
    expect(overlap.waves.length).toBeGreaterThan(1);
    expect(overlap.waves.length).toBeLessThanOrEqual(12);
    expect(overlap.waves.every((age) => age < WAVE_LIFETIME)).toBe(true);
    expect(waveAt(0, [0.07])).toBeGreaterThan(0.8);
    expect(waveAt(ROWS - 1, [0.07])).toBeLessThan(0.001);
    expect(waveAt(ROWS - 1, [0.66])).toBeGreaterThan(0.3);
    const settled = live.play(4);
    expect(settled.waves).toEqual([]);
    expect(settled.shake).toBe(0);
  });

  it("preserves phase when Energy or Motion Speed changes and holds at zero speed", () => {
    const live = show();
    const before = live.play(2);
    const edited = live.play(0, { motionSpeed: 3, energy: 1 });
    expect(edited.phase).toBe(before.phase);
    expect(edited.lightPhase).toBe(before.lightPhase);
    expect(edited.opening).toBe(before.opening);
    expect(edited.energy).toBe(before.energy);
    const running = live.play(0.1);
    expect(running.phase).toBeGreaterThan(before.phase);
    const frozen = live.play(20, { motionSpeed: 0 });
    expect(frozen.phase).toBe(running.phase);
    expect(frozen.lightPhase).toBe(running.lightPhase);
    expect(frozen.energy).toBeCloseTo(1);
    live.cue("kick");
    expect(live.play(0.1).waves).toHaveLength(1);
  });

  it("reconfigures continuously even when retriggered during a transition", () => {
    const live = show();
    live.cue("drop");
    live.play(3);
    live.cue("reconfigure");
    const moving = live.play(0.5);
    expect(moving.configurations[0]).toBeGreaterThan(0);
    expect(moving.configurations[1]).toBeGreaterThan(0);
    live.cue("reconfigure");
    expect(live.play(0).configurations).toEqual(moving.configurations);
    const fan = live.play(10);
    expect(fan.section).toBe("drop");
    expect(fan.configurations[2]).toBeGreaterThan(0.999);
    expect(
      fan.configurations.reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1);
    live.cue("reconfigure");
    expect(live.play(10).configurations[0]).toBeGreaterThan(0.999);
  });
});

describe("Monolith rendering state", () => {
  const player = () =>
    createShaderPlayer(monolith, { width: 320, height: 180, seed: "test" });

  it("exposes the shared Cues and supplies every declared shader uniform", () => {
    expect(monolith.cues?.map((cue) => cue.key)).toEqual([
      "kick",
      "strobe",
      "flash",
      "build",
      "drop",
      "breakdown",
      "calm",
      "reconfigure",
    ]);
    const live = player();
    const frame = live.frame(DT, {}, 320, 180);
    expect(frame).toMatchObject({
      blank: false,
      changed: true,
      resolution: 0.65,
    });
    expect(frame.failure).toBeUndefined();
    for (const match of monolith.fragment.matchAll(/uniform \w+ u_(\w+)/g)) {
      expect(frame.uniforms).toHaveProperty(match[1] ?? "missing");
      expect(Object.keys(monolithParameters)).not.toContain(match[1]);
    }
    expect(live.frame(0, { renderResolution: 0.3 }, 320, 180).resolution).toBe(
      0.3,
    );
  });

  it("reuses a frozen frame, redraws for Cues and keeps Shake zero steady", () => {
    const live = player();
    const params = { motionSpeed: 0, shake: 0 };
    expect(live.frame(DT, params, 320, 180).changed).toBe(true);
    expect(live.frame(DT, params, 320, 180).changed).toBe(false);
    live.cue("unknown");
    expect(live.frame(DT, params, 320, 180).changed).toBe(false);
    live.cue("kick");
    const hit = live.frame(DT, params, 320, 180);
    expect(hit.changed).toBe(true);
    expect(
      (hit.uniforms.jolt as readonly number[]).every((value) => value === 0),
    ).toBe(true);
    for (let i = 0; i < 240; i += 1) live.frame(DT, params, 320, 180);
    expect(live.frame(DT, params, 320, 180).changed).toBe(false);
  });

  it("packs finite, normalized slab transforms through sustained rapid performance", () => {
    const live = show({ energy: 1, separation: 1, torsion: 1, motionSpeed: 3 });
    const poses = new Float32Array(SLABS * 4);
    const turns = new Float32Array(SLABS * 4);
    const cues = [
      "drop",
      "reconfigure",
      "kick",
      "strobe",
      "build",
      "breakdown",
      "calm",
    ];
    for (let i = 0; i < 300; i += 1) {
      live.cue(cues[i % cues.length] ?? "kick");
      packAssembly(
        live.play(0.2),
        values({ separation: 1, torsion: 1 }),
        poses,
        turns,
      );
      expect([...poses, ...turns].every(Number.isFinite)).toBe(true);
      for (let slab = 0; slab < SLABS; slab += 1) {
        expect(
          Math.hypot(turns[slab * 4] ?? 0, turns[slab * 4 + 1] ?? 0),
        ).toBeCloseTo(1, 5);
        expect(Math.abs(poses[slab * 4 + 1] ?? 0)).toBeLessThan(3);
      }
    }
  });

  it("keeps the assembly continuous when its integrated phase wraps", () => {
    const live = show();
    live.cue("drop");
    const look = live.play(4);
    const a = new Float32Array(SLABS * 4);
    const b = new Float32Array(SLABS * 4);
    const turnA = new Float32Array(SLABS * 4);
    const turnB = new Float32Array(SLABS * 4);
    packAssembly({ ...look, phase: Math.PI * 2 - 1e-5 }, values(), a, turnA);
    packAssembly({ ...look, phase: 1e-5 }, values(), b, turnB);
    for (let i = 0; i < a.length; i += 1) {
      expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(0.001);
      expect(Math.abs((turnA[i] ?? 0) - (turnB[i] ?? 0))).toBeLessThan(0.001);
    }
  });
});
