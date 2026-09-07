import type { Patch } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { OutputPresence } from "./output-presence.ts";

const telemetry = {
  width: 1920,
  height: 1080,
  pixelRatio: 1,
  frameIntervalMs: 16.7,
  renderWorkMs: 2,
  workload: {
    canvasVisuals: { executedPerFrame: 0, enabled: 0, relevant: 0 },
    shaderVisuals: { executedPerFrame: 0, enabled: 0, relevant: 0 },
    filters: { executedPerFrame: 0, enabled: 0, relevant: 0 },
  },
};

describe("OutputPresence", () => {
  it("tracks sessions per Output, goes stale, then drops them", () => {
    let now = 1_000;
    const presence = new OutputPresence({
      now: () => now,
      staleAfterMs: 3_000,
      dropAfterMs: 10_000,
      sweepIntervalMs: 60_000,
    });
    const patches: Patch[][] = [];
    presence.onChange((batch) => patches.push([...batch]));

    presence.attach("s1", "out_a");
    presence.attach("s2", "out_a");
    presence.report("s1", telemetry);
    expect(Object.keys(presence.state().outputs.out_a?.sessions ?? {})).toEqual(
      ["s1", "s2"],
    );
    expect(presence.state().outputs.out_a?.sessions.s1?.telemetry).toEqual(
      telemetry,
    );
    expect(patches.at(-1)).toMatchObject([
      {
        op: "set",
        path: ["outputs", "out_a", "sessions", "s1"],
        value: { reportedAt: 1_000, stale: false },
      },
    ]);

    now = 5_000;
    presence.sweep();
    expect(presence.state().outputs.out_a?.sessions.s1?.stale).toBe(true);

    now = 12_000;
    presence.sweep();
    expect(presence.state()).toEqual({ outputs: {} });
    expect(patches.at(-1)).toEqual([
      { op: "remove", path: ["outputs", "out_a", "sessions", "s2"] },
      { op: "remove", path: ["outputs", "out_a"] },
    ]);
    presence.close();
  });

  it("re-attaching moves a session and reconcile drops orphans", () => {
    const presence = new OutputPresence({ sweepIntervalMs: 60_000 });
    presence.attach("s1", "out_a");
    presence.attach("s1", "out_b");
    expect(Object.keys(presence.state().outputs)).toEqual(["out_b"]);
    presence.reconcile(new Set(["out_a"]));
    expect(presence.state()).toEqual({ outputs: {} });
    presence.close();
  });
});
