import {
  createShaderPlayer,
  createVisualPlayer,
  recordingContext,
  type ShaderVisual,
} from "@difracta/render/sdk";
import { describe, expect, it } from "vitest";

import { flashMatrix } from "./flash-matrix.ts";
import { pixelBar } from "./pixel-bar.ts";
import { scannerShot } from "./scanner-shot.ts";
import { tensionLines } from "./tension-lines.ts";

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

describe("Flash Matrix", () => {
  it("is blank until a Flash, keeps overlapping flashes, and drops each after its life", () => {
    const { cue, frame } = shader(flashMatrix);
    const values = {
      automaticRate: 0,
      delaySpread: 100,
      hold: 70,
      fadeOut: 260,
    };
    expect(frame(values).blank).toBe(true);
    cue("flash");
    const lit = frame(values);
    expect(lit.blank).toBe(false);
    expect(lit.uniforms.flash_count).toBe(1);
    for (let i = 0; i < 12; i += 1) frame(values);
    cue("flash");
    const two = frame(values);
    expect(two.uniforms.flash_count).toBe(2);
    const packed = (two.uniforms.flashes as { values: Float32Array }).values;
    expect(packed[0]).toBeGreaterThan(packed[2] ?? 0); // the older is older
    // 430 ms after the first, it is gone; the second still runs.
    for (let i = 0; i < 14; i += 1) frame(values);
    expect(frame(values).uniforms.flash_count).toBe(1);
    for (let i = 0; i < 30; i += 1) frame(values);
    expect(frame(values).blank).toBe(true);
    // The Automatic Rate flashes by itself.
    let flashed = false;
    for (let i = 0; i < 300 && !flashed; i += 1)
      flashed = !frame({ automaticRate: 4 }).blank;
    expect(flashed).toBe(true);
  });
});

describe("Scanner Shot", () => {
  it("runs each scan until its trail has left, and stacks them", () => {
    const { cue, frame } = shader(scannerShot);
    const values = { travelDuration: 600, width: 0.1, trail: 0.2 };
    expect(frame(values).blank).toBe(true);
    cue("scan");
    expect(frame(values).uniforms.scan_count).toBe(1);
    cue("scan");
    const ages = frame(values).uniforms.ages as Float32Array;
    expect(ages[0]).toBeCloseTo(2 / 60, 6);
    expect(ages[1]).toBeCloseTo(1 / 60, 6);
    // The head crosses in 600 ms; the trail needs 0.2 / 1.1 of that more.
    const life = 0.6 * (1.3 / 1.1);
    for (let i = 0; i < Math.floor(life * 60) - 3; i += 1) frame(values);
    expect(frame(values).uniforms.scan_count).toBe(2);
    for (let i = 0; i < 4; i += 1) frame(values);
    expect(frame(values).blank).toBe(true);
  });
});

const barPath = {
  points: [
    { x: 0.1, y: 0.5 },
    { x: 0.9, y: 0.5 },
  ],
  closed: false,
};

describe("Pixel Bar", () => {
  it("always paints the bar, lights packets per Launch, and alternates their direction", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(pixelBar, {
      context: recording.context,
      width: 320,
      height: 180,
      seed: "test",
    });
    const paths = { path: barPath };
    const values = {
      pixels: 8,
      effect: "scanner",
      direction: "alternate",
      speed: 1,
      automaticRate: 0,
    };
    expect(player.frame(DT, values, paths)).toMatchObject({
      rendered: true,
      blank: false,
    });
    expect(recording.callsTo("fillRect")).toHaveLength(8);
    expect(player.frame(DT, values, paths).rendered).toBe(false); // still
    // A Launch lights one Scanner pixel over the background's eight.
    player.cue("launch");
    recording.clear();
    player.frame(DT, values, paths);
    const rects = recording.callsTo("fillRect");
    expect(rects).toHaveLength(9);
    const translates = recording
      .callsTo("translate")
      .map((call) => Number(call.args[0]));
    // The first launch runs forward: its lit pixel is the leftmost one.
    expect(translates[8]).toBe(translates[0]);
    // A second Launch runs the other way.
    for (let i = 0; i < 70; i += 1) player.frame(DT, values, paths);
    player.cue("launch");
    recording.clear();
    player.frame(DT, values, paths);
    const again = recording
      .callsTo("translate")
      .map((call) => Number(call.args[0]));
    expect(again[8]).toBe(again[7]);
  });
});

describe("Tension Lines", () => {
  it("adds a line per Add Line, caps them, eases Vibration, and clears on Release", () => {
    const recording = recordingContext();
    const player = createVisualPlayer(tensionLines, {
      context: recording.context,
      width: 320,
      height: 180,
      seed: "test",
    });
    const strokes = () => recording.callsTo("stroke").length;
    expect(player.frame(DT, {}).blank).toBe(true);
    player.cue("addLine");
    player.cue("addLine");
    recording.clear();
    expect(player.frame(DT, {})).toMatchObject({
      blank: false,
      rendered: true,
    });
    expect(strokes()).toBe(2);
    for (let i = 0; i < 5; i += 1) player.cue("addLine");
    recording.clear();
    player.frame(DT, { maximumLines: 3 });
    expect(strokes()).toBe(3);
    // A Vibration change is followed over a few frames, not snapped.
    recording.clear();
    player.frame(DT, { maximumLines: 3, speed: 0, vibration: 0.06 });
    const early = recording.callsTo("lineTo").map((call) => call.args);
    recording.clear();
    for (let i = 0; i < 60; i += 1)
      player.frame(DT, { maximumLines: 3, speed: 0, vibration: 0.06 });
    const settled = recording
      .callsTo("lineTo")
      .slice(-40)
      .map((c) => c.args);
    expect(early.slice(-40)).not.toEqual(settled);
    player.cue("release");
    recording.clear();
    expect(player.frame(DT, {}).blank).toBe(true);
    expect(strokes()).toBe(0);
  });
});
