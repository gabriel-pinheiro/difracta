import {
  createShaderPlayer,
  createVisualPlayer,
  recordingContext,
  type ShaderVisual,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { beamWeb } from "./beam-web.ts";
import { blink } from "./blink.ts";
import { strobe } from "./strobe.ts";
import { thunder } from "./thunder.ts";

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

describe("Blink", () => {
  it("is blank until its Cue, holds, then drops the blink", () => {
    const { cue, frame } = shader(blink);
    expect(frame().blank).toBe(true);
    cue("blink");
    const lit = frame();
    expect(lit).toMatchObject({ blank: false, uniforms: { alpha: 1 } });
    for (let i = 0; i < 3; i += 1) frame();
    expect(frame().changed).toBe(false); // still holding, nothing moved
    const after = frame({}, 0.1);
    expect(after).toMatchObject({ blank: true, uniforms: { alpha: 0 } });
  });

  it("overlaps blinks and honours Trigger Chance", () => {
    const { cue, frame } = shader(blink);
    frame({ fadeOut: 200 });
    cue("blink");
    for (let i = 0; i < 9; i += 1) frame({ fadeOut: 200 });
    expect(frame({ fadeOut: 200 }).uniforms.alpha).toBeLessThan(1); // fading
    cue("blink"); // mid-fade: the new hold wins
    for (let i = 0; i < 3; i += 1) frame({ fadeOut: 200 });
    expect(frame({ fadeOut: 200 }).uniforms.alpha).toBe(1);
    const never = shader(blink);
    never.frame({ chance: 0 });
    never.cue("blink");
    expect(never.frame({ chance: 0 }).blank).toBe(true);
  });
});

describe("Strobe", () => {
  it("flips on and off at the rate, reporting change only at flips, and keeps its phase", () => {
    const { frame } = shader(strobe);
    const states = Array.from({ length: 60 }, () => frame({ rate: 2.5 }));
    // 50 ms of every 400 ms cycle is on: the first frames of each 24-frame cycle.
    expect(states.map((s) => s.uniforms.on).slice(0, 5)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(states[24]?.uniforms.on).toBe(true);
    expect(states.filter((s) => s.changed)).toHaveLength(6); // 3 cycles × 2 flips
    expect(states[4]?.blank).toBe(true); // off color is transparent
    const faster = frame({ rate: 20 });
    expect(faster.changed).toBe(true); // the Parameter changed, no jump implied
  });
});

describe("Thunder", () => {
  it("bursts on its Cue and on the Automatic Rate, then goes dark", () => {
    const { cue, frame } = shader(thunder);
    expect(frame({ automaticRate: 0 }).blank).toBe(true);
    cue("flash");
    const first = frame({ automaticRate: 0 });
    expect(first.blank).toBe(false);
    expect(first.uniforms.alpha).toBeGreaterThan(0);
    const lit = Array.from(
      { length: 120 },
      () => !frame({ automaticRate: 0 }).blank,
    );
    // 3 flashes 160 ms apart, 60 ms each, dark between them, 350 ms fade.
    expect(lit.filter(Boolean).length).toBeGreaterThan(10);
    expect(lit.lastIndexOf(true)).toBeGreaterThan(25);
    expect(lit.lastIndexOf(true)).toBeLessThan(80);
    expect(lit.includes(false)).toBe(true);
    const auto = shader(thunder);
    let litByItself = 0;
    for (let i = 0; i < 600; i += 1)
      if (!auto.frame({ automaticRate: 4 }).blank) litByItself += 1;
    expect(litByItself).toBeGreaterThan(0);
  });
});

describe("Beam Web", () => {
  it("adds a beam per Add Beam, caps them, and clears on Release", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(beamWeb, {
      context: recording.context,
      width: 320,
      height: 180,
      seed: "test",
    });
    const beams = () => recording.callsTo("lineTo").length;
    expect(player.frame(DT, {}).blank).toBe(true);
    player.cue("addBeam");
    player.cue("addBeam");
    recording.clear();
    expect(player.frame(DT, {})).toMatchObject({
      blank: false,
      rendered: true,
    });
    expect(beams()).toBe(2);
    for (let i = 0; i < 5; i += 1) player.cue("addBeam");
    recording.clear();
    player.frame(DT, { maximumBeams: 3 });
    expect(beams()).toBe(3);
    player.cue("release");
    recording.clear();
    expect(player.frame(DT, {}).blank).toBe(true);
    expect(beams()).toBe(0);
  });
});
