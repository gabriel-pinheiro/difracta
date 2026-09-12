import { describe, expect, it } from "vitest";

import { defineFilter, type FilterFrame } from "./filter.ts";
import { createFilterPlayer } from "./filter-player.ts";

const frames: FilterFrame<never>[] = [];
let disposed = 0;

const probe = defineFilter({
  id: "probe",
  name: "Probe",
  description: "Reports what it is told.",
  parameters: {
    amount: { kind: "number", label: "Amount", default: 0.5, min: 0, max: 1 },
    still: { kind: "boolean", label: "Still", default: false },
  },
  fragment: "vec4 filter_image(vec2 uv) { return sample_input(uv); }",
  create: () => {
    let phase = 0;
    return {
      update(frame) {
        frames.push(frame as FilterFrame<never>);
        phase += frame.dt;
        return {
          changed: !frame.params.still,
          identity: frame.params.amount === 0,
          ...(frame.params.still ? {} : { uniforms: { phase } }),
        };
      },
      dispose() {
        disposed += 1;
      },
    };
  },
});

const plain = defineFilter({
  id: "plain",
  name: "Plain",
  description: "Depends on its Parameters only.",
  parameters: {
    level: { kind: "number", label: "Level", default: 1, min: 0, max: 1 },
  },
  fragment: "vec4 filter_image(vec2 uv) { return sample_input(uv); }",
});

let faultyUpdates = 0;

/** Runs once, then throws from its second update. */
const faulty = defineFilter({
  id: "faulty",
  name: "Faulty",
  description: "Throws on its second frame.",
  parameters: {},
  fragment: "vec4 filter_image(vec2 uv) { return sample_input(uv); }",
  create: () => ({
    update() {
      faultyUpdates += 1;
      if (faultyUpdates > 1) throw new Error("boom");
      return { uniforms: { phase: 1 } };
    },
    dispose() {
      disposed += 1;
    },
  }),
});

describe("createFilterPlayer", () => {
  it("creates once, completes values, clamps time and carries uniforms", () => {
    frames.length = 0;
    disposed = 0;
    const player = createFilterPlayer(probe, {
      width: 960,
      height: 540,
      seed: "layer",
    });
    const first = player.frame(0.5, {}, 960, 540);
    expect(frames[0]).toMatchObject({
      dt: 0.1,
      params: { amount: 0.5, still: false },
      width: 960,
      height: 540,
      changed: true,
    });
    expect(first).toEqual({
      identity: false,
      changed: true,
      uniforms: { phase: 0.1 },
    });
    const second = player.frame(0.01, { still: true }, 1920, 1080);
    expect(frames[1]).toMatchObject({ dt: 0.01, changed: true, width: 1920 });
    // Nothing returned this frame: the last uniforms stand.
    expect(second).toEqual({
      identity: false,
      changed: false,
      uniforms: { phase: 0.1 },
    });
    expect(player.frame(0.01, { still: true }, 1920, 1080).changed).toBe(false);
    player.dispose();
    expect(disposed).toBe(1);
  });

  it("reports a change when identity flips, even if the instance says still", () => {
    const player = createFilterPlayer(probe, { width: 1, height: 1, seed: 1 });
    player.frame(0.01, { still: true }, 1, 1);
    expect(player.frame(0.01, { still: true }, 1, 1).changed).toBe(false);
    const gone = player.frame(0.01, { still: true, amount: 0 }, 1, 1);
    expect(gone).toMatchObject({ identity: true, changed: true });
    expect(player.frame(0.01, { still: true, amount: 0 }, 1, 1).changed).toBe(
      false,
    );
  });

  it("treats a Filter without create as changing only with its Parameters", () => {
    const player = createFilterPlayer(plain, { width: 1, height: 1, seed: 1 });
    expect(player.frame(0.01, {}, 1, 1)).toEqual({
      identity: false,
      changed: true,
      uniforms: {},
    });
    expect(player.frame(0.01, {}, 1, 1).changed).toBe(false);
    expect(player.frame(0.01, { level: 0.2 }, 1, 1).changed).toBe(true);
  });

  it("stops an instance that throws and is identity from then on", () => {
    faultyUpdates = 0;
    disposed = 0;
    const player = createFilterPlayer(faulty, { width: 1, height: 1, seed: 1 });
    expect(player.frame(0.01, {}, 1, 1)).toEqual({
      identity: false,
      changed: true,
      uniforms: { phase: 1 },
    });
    const failed = player.frame(0.01, {}, 1, 1);
    // The pass dropping out changes the picture once.
    expect(failed).toMatchObject({ identity: true, changed: true });
    expect(failed.failure?.message).toBe("boom");
    expect(disposed).toBe(1);
    const later = player.frame(0.01, {}, 1, 1);
    expect(later).toMatchObject({ identity: true, changed: false });
    expect(later.failure).toBe(failed.failure);
    expect(faultyUpdates).toBe(2);
    player.dispose();
    expect(disposed).toBe(1);
  });
});
