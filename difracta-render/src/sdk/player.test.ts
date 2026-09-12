import { describe, expect, it } from "vitest";

import { createVisualPlayer } from "./player.ts";
import { recordingContext } from "./recording-context.ts";
import { defineVisual, type VisualFrame } from "./visual.ts";

const frames: VisualFrame<never>[] = [];
let disposed = 0;

const probe = defineVisual({
  id: "probe",
  name: "Probe",
  description: "Reports what it is told.",
  parameters: {
    level: { kind: "number", label: "Level", default: 0.5, min: 0, max: 1 },
    blank: { kind: "boolean", label: "Blank", default: false },
    still: { kind: "boolean", label: "Still", default: false },
  },
  create: () => ({
    update(frame) {
      frames.push(frame as VisualFrame<never>);
      return { blank: frame.params.blank, changed: !frame.params.still };
    },
    render({ context, width, height }) {
      context.fillRect(0, 0, width, height);
    },
    dispose() {
      disposed += 1;
    },
  }),
});

let faultyUpdates = 0;

/** Draws once, then throws from its second update. */
const faulty = defineVisual({
  id: "faulty",
  name: "Faulty",
  description: "Throws on its second frame.",
  parameters: {},
  create: () => ({
    update() {
      faultyUpdates += 1;
      if (faultyUpdates > 1) throw new Error("boom");
    },
    render({ context, width, height }) {
      context.fillRect(0, 0, width, height);
    },
    dispose() {
      disposed += 1;
    },
  }),
});

function player() {
  const recording = recordingContext();
  frames.length = 0;
  disposed = 0;
  const instance = createVisualPlayer(probe, {
    context: recording.context,
    width: 320,
    height: 180,
    seed: "layer_a",
  });
  return { instance, recording };
}

describe("visual player", () => {
  it("completes Parameters, flags changes and clamps time", () => {
    const { instance } = player();
    instance.frame(1 / 60, {});
    instance.frame(5, { level: 0.5 });
    instance.frame(0.02, { level: 0.9 });
    instance.frame(-1, { level: 0.9 });
    expect(frames.map((frame) => frame.changed)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(frames.map((frame) => frame.dt)).toEqual([1 / 60, 0.1, 0.02, 0]);
    expect(frames[0]?.params).toEqual({
      level: 0.5,
      blank: false,
      still: false,
    });
    expect(frames[0]?.width).toBe(320);
  });

  it("redraws only when the instance says something changed", () => {
    const { instance, recording } = player();
    expect(instance.frame(0.016, { still: true })).toEqual({
      rendered: true,
      blank: false,
    });
    expect(recording.callsTo("fillRect")).toHaveLength(1);
    expect(recording.callsTo("clearRect")).toHaveLength(1);
    expect(instance.frame(0.016, { still: true })).toEqual({
      rendered: false,
      blank: false,
    });
    expect(recording.callsTo("fillRect")).toHaveLength(1);
    expect(instance.frame(0.016, { still: false })).toEqual({
      rendered: true,
      blank: false,
    });
    expect(recording.callsTo("fillRect")).toHaveLength(2);
  });

  it("skips blank frames and redraws once content returns", () => {
    const { instance, recording } = player();
    expect(instance.frame(0.016, { blank: true, still: true })).toEqual({
      rendered: false,
      blank: true,
    });
    expect(recording.calls).toHaveLength(0);
    expect(instance.frame(0.016, { blank: false, still: true })).toEqual({
      rendered: true,
      blank: false,
    });
    // Still unchanged after that: the one redraw was enough.
    expect(instance.frame(0.016, { blank: false, still: true }).rendered).toBe(
      false,
    );
  });

  it("disposes the instance once", () => {
    const { instance } = player();
    instance.frame(0.016, {});
    instance.dispose();
    instance.dispose();
    expect(disposed).toBe(1);
  });

  it("stops an instance that throws and reports the failure on every later frame", () => {
    const recording = recordingContext();
    faultyUpdates = 0;
    disposed = 0;
    const instance = createVisualPlayer(faulty, {
      context: recording.context,
      width: 320,
      height: 180,
      seed: "layer_a",
    });
    expect(instance.frame(0.016, {})).toEqual({ rendered: true, blank: false });
    const failed = instance.frame(0.016, {});
    expect(failed).toMatchObject({ rendered: false, blank: true });
    expect(failed.failure?.message).toBe("boom");
    expect(disposed).toBe(1);
    // The instance is gone: later frames and Cues never reach it.
    expect(() => instance.cue("hit")).not.toThrow();
    const later = instance.frame(0.016, {});
    expect(later).toMatchObject({ rendered: false, blank: true });
    expect(later.failure).toBe(failed.failure);
    expect(faultyUpdates).toBe(2);
    expect(recording.callsTo("fillRect")).toHaveLength(1);
    instance.dispose();
    expect(disposed).toBe(1);
  });
});
