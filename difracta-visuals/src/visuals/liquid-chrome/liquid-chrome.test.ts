import {
  createRandom,
  createShaderPlayer,
  resolveParameters,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import {
  createDirector,
  SHATTER_BURST,
  SHATTER_GATHER,
  SHATTER_HANG,
  shatterAmount,
  type ChromeFrame,
} from "./director.ts";
import { liquidChrome } from "./liquid-chrome.ts";
import {
  FORM_OPTIONS,
  FORM_ORDER_OPTIONS,
  QUALITY_OPTIONS,
  liquidChromeParameters,
  type LiquidChromeValues,
} from "./parameters.ts";
import {
  axes,
  DROPLETS,
  droplets,
  SATELLITES,
  satellites,
} from "./sculpture.ts";

const DT = 1 / 60;

function values(overrides: Partial<LiquidChromeValues> = {}) {
  return resolveParameters(liquidChromeParameters, overrides);
}

function director(overrides: Partial<LiquidChromeValues> = {}) {
  let params = values(overrides);
  const instance = createDirector(createRandom("test"), params);
  let last: ChromeFrame | undefined;
  const step = (seconds: number, changes: Partial<LiquidChromeValues> = {}) => {
    params = { ...params, ...changes };
    const frames = Math.max(1, Math.round(seconds / DT));
    for (let i = 0; i < frames; i += 1) last = instance.advance(DT, params);
    if (last === undefined) throw new Error("No frame.");
    return last;
  };
  return { cue: (key: string) => instance.cue(key), step };
}

describe("Liquid Chrome definition", () => {
  it("keeps the options in the order the fragment and director read", () => {
    expect(FORM_OPTIONS.map((option) => option.value)).toEqual([
      "mercury",
      "torus",
      "urchin",
      "gyroid",
      "twisted-ring",
    ]);
    expect(FORM_ORDER_OPTIONS.map((option) => option.value)).toEqual([
      "sequence",
      "random",
    ]);
    expect(QUALITY_OPTIONS.map((option) => option.value)).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });

  it("paints from uniforms that shadow no Parameter, Kick first among its Cues", () => {
    expect(liquidChrome.fragment).toContain("vec4 render_visual(vec2 uv)");
    const declared = [
      ...liquidChrome.fragment.matchAll(/uniform \w+ u_(\w+)/g),
    ].map((match) => match[1]);
    for (const name of declared)
      expect(Object.keys(liquidChromeParameters)).not.toContain(name);
    expect(liquidChrome.cues?.[0]?.key).toBe("kick");
  });

  it("renders at its Resolution, never blank by default, every frame new", () => {
    const player = createShaderPlayer(liquidChrome, {
      width: 320,
      height: 180,
      seed: "test",
    });
    const first = player.frame(DT, { renderResolution: 0.5 }, 320, 180);
    expect(first).toMatchObject({
      blank: false,
      changed: true,
      resolution: 0.5,
    });
    player.cue("shatter");
    const second = player.frame(DT, { renderResolution: 0.5 }, 320, 180);
    expect(second.changed).toBe(true);
    expect(second.uniforms.shatter).toBeGreaterThan(0);
    const clear = [0, 0, 0, 0] as const;
    expect(
      player.frame(
        DT,
        {
          background: clear,
          metalColor: clear,
          lightColorA: clear,
          lightColorB: clear,
        },
        320,
        180,
      ).blank,
    ).toBe(true);
  });
});

describe("Liquid Chrome sculpture", () => {
  it("keeps the droplets pooled in the core until a Shatter throws them out", () => {
    const whole = droplets(0, 1);
    const burst = droplets(1, 1);
    for (let i = 0; i < DROPLETS; i += 1) {
      const at = (packed: Float32Array) =>
        Math.hypot(
          packed[i * 4] ?? 0,
          packed[i * 4 + 1] ?? 0,
          packed[i * 4 + 2] ?? 0,
        );
      expect(at(whole)).toBe(0);
      expect(at(burst)).toBeGreaterThan(0.7);
    }
    expect(satellites(3)).toHaveLength(SATELLITES * 4);
  });

  it("turns by a proper rotation", () => {
    const [x, y, z] = axes(7.3);
    const dot = (a: readonly number[], b: readonly number[]) =>
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
    for (const column of [x, y, z]) expect(dot(column, column)).toBeCloseTo(1);
    expect(dot(x, y)).toBeCloseTo(0);
    expect(dot(y, z)).toBeCloseTo(0);
    expect(dot(x, z)).toBeCloseTo(0);
  });
});

describe("Liquid Chrome director", () => {
  it("swells on a Kick and lets it die away, restarting the ripple", () => {
    const { cue, step } = director();
    expect(step(DT).kick).toBe(0);
    cue("kick");
    const hit = step(DT);
    expect(hit.kick).toBeGreaterThan(0.85);
    expect(hit.ripple).toBeLessThan(0.05);
    expect(step(0.8).kick).toBeLessThan(0.02);
  });

  it("morphs to the next form over Morph Duration and holds a second ask until then", () => {
    const { cue, step } = director({ morphDuration: 1000 });
    expect(step(DT)).toMatchObject({ formA: 0, formB: 0, morph: 0 });
    cue("morph");
    const early = step(0.25);
    expect(early).toMatchObject({ formA: 0, formB: 1 });
    expect(early.morph).toBeGreaterThan(0);
    cue("morph");
    const later = step(0.5);
    expect(later.formB).toBe(1);
    expect(later.morph).toBeGreaterThan(early.morph);
    // The first lands, and the waiting one starts from there.
    const landed = step(0.3);
    expect(landed).toMatchObject({ formA: 1, formB: 2 });
    expect(step(1.1)).toMatchObject({ formA: 2, formB: 2, morph: 0 });
  });

  it("carries a morph on without a jump when Morph Duration changes mid-way", () => {
    const { cue, step } = director({ morphDuration: 2000 });
    cue("morph");
    const before = step(0.5).morph;
    const after = step(DT, { morphDuration: 500 }).morph;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(0.1);
  });

  it("morphs to a Form chosen by Parameter, and never repeats a form in Random order", () => {
    const chosen = director({ morphDuration: 100 });
    chosen.step(DT);
    expect(chosen.step(0.2, { form: "gyroid" })).toMatchObject({
      formA: 3,
      formB: 3,
    });
    const shuffled = director({ formOrder: "random", morphDuration: 100 });
    let form = shuffled.step(DT).formA;
    for (let i = 0; i < 20; i += 1) {
      shuffled.cue("morph");
      const next = shuffled.step(0.2).formA;
      expect(next).not.toBe(form);
      form = next;
    }
  });

  it("morphs on its own at an Automatic Rate", () => {
    const { step } = director({ automaticRate: 1, morphDuration: 100 });
    // Five morphs in sequence would come back round, so look sooner.
    expect(step(2.5).formA).not.toBe(0);
  });

  it("bursts on a Shatter, hangs, gathers back and knocks the camera", () => {
    const { cue, step } = director({ shake: 1 });
    expect(Math.hypot(...step(DT).cameraShake)).toBe(0);
    cue("shatter");
    const burst = step(SHATTER_BURST + 0.1);
    expect(burst.shatter).toBe(1);
    expect(Math.hypot(...burst.cameraShake)).toBeGreaterThan(0);
    expect(step(SHATTER_HANG + SHATTER_GATHER).shatter).toBe(0);
    expect(shatterAmount(0, 0.4)).toBeCloseTo(0.4);
    expect(shatterAmount(SHATTER_BURST, 0)).toBeCloseTo(1);
  });

  it("turns the camera by Rotation Speed, continuously through a change", () => {
    const { step } = director({ rotationSpeed: 0.1, energy: 0 });
    const a = step(DT).orbit;
    const b = step(DT).orbit;
    const c = step(DT, { rotationSpeed: 0.2 }).orbit;
    expect(b - a).toBeCloseTo(DT * 0.1 * 0.6, 6);
    expect(c - b).toBeCloseTo(DT * 0.2 * 0.6, 6);
  });
});
