import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { restartDecision, RuntimeRestarts } from "./runtime-restarts.ts";

const {
  runtimeRestartInitialDelayMs: initial,
  runtimeRestartLimit: limit,
  runtimeRestartWindowMs: window,
} = settings.desktop;

/** A runtime whose starts are scripted, on a clock that only `wait` moves. */
function supervised(starts: boolean[] = []) {
  let clock = 0;
  const seen = {
    started: [] as (string | undefined)[],
    waits: [] as number[],
    lines: [] as string[],
    restarted: 0,
    gaveUp: 0,
    stopped: 0,
  };
  let file: string | undefined = "/shows/now.difracta";
  const restarts = new RuntimeRestarts({
    start: (with_) => {
      seen.started.push(with_);
      return Promise.resolve({ ok: starts.shift() ?? true });
    },
    stop: () => {
      seen.stopped += 1;
      return Promise.resolve();
    },
    currentFile: () => file,
    restarted: () => (seen.restarted += 1),
    gaveUp: () => (seen.gaveUp += 1),
    log: (line) => seen.lines.push(line),
    now: () => clock,
    wait: (ms) => {
      seen.waits.push(ms);
      clock += ms;
      return Promise.resolve();
    },
  });
  return {
    restarts,
    seen,
    open: (next: string | undefined) => (file = next),
    pass: (ms: number) => (clock += ms),
  };
}

describe("restart policy", () => {
  it("doubles the wait for every restart still inside the window, then gives up", () => {
    expect(restartDecision([], 0)).toEqual({
      kind: "restart",
      delayMs: initial,
    });
    expect(restartDecision([0, 10], 20)).toEqual({
      kind: "restart",
      delayMs: initial * 4,
    });
    const many = Array.from({ length: limit }, (_, index) => index);
    expect(restartDecision(many, limit)).toEqual({ kind: "give-up" });
    // Restarts long ago say nothing about the runtime of now.
    expect(restartDecision(many, window + limit)).toEqual({
      kind: "restart",
      delayMs: initial,
    });
  });
});

describe("a runtime child that exits", () => {
  it("is started again with the Installation that was open, not the one it started with", async () => {
    const { restarts, seen, open } = supervised();
    open("/shows/opened-later.difracta");
    await restarts.exited(9, false);
    expect(seen.started).toEqual(["/shows/opened-later.difracta"]);
    expect(seen.waits).toEqual([initial]);
    expect(seen.restarted).toBe(1);
    expect(seen.lines[0]).toContain("exit code 9");
    expect(seen.lines[0]).toContain("/shows/opened-later.difracta");

    // An Installation never saved has no path to reopen.
    open(undefined);
    await restarts.exited(9, false);
    expect(seen.started[1]).toBeUndefined();
  });

  it("is left alone when Desktop asked it to stop, and once the session is over", async () => {
    const { restarts, seen } = supervised();
    await restarts.exited(0, true);
    restarts.end();
    await restarts.exited(1, false);
    expect(seen.started).toEqual([]);
    expect(seen.lines).toEqual([]);
  });

  it("backs off while it keeps dying, gives up at the limit, and says so once", async () => {
    const { restarts, seen } = supervised();
    for (let crash = 0; crash <= limit; crash += 1)
      await restarts.exited(1, false);
    expect(seen.waits).toEqual(
      Array.from({ length: limit }, (_, index) => initial * 2 ** index),
    );
    expect(seen.started).toHaveLength(limit);
    expect(seen.gaveUp).toBe(1);
    expect(seen.lines.at(-1)).toContain("stops trying");
  });

  it("starts over after running well for longer than the window", async () => {
    const { restarts, seen, pass } = supervised();
    for (let crash = 0; crash < limit; crash += 1)
      await restarts.exited(1, false);
    pass(window);
    await restarts.exited(1, false);
    expect(seen.gaveUp).toBe(0);
    expect(seen.waits.at(-1)).toBe(initial);
  });

  it("counts a restart that does not come up, and stops what it left behind", async () => {
    const { restarts, seen } = supervised([false, true]);
    await restarts.exited(1, false);
    expect(seen.started).toHaveLength(2);
    expect(seen.waits).toEqual([initial, initial * 2]);
    expect(seen.stopped).toBe(1);
    expect(seen.restarted).toBe(1);
  });

  it("does not start anything once the session ended during the wait", async () => {
    const { restarts, seen } = supervised();
    const exited = restarts.exited(1, false);
    restarts.end();
    await exited;
    expect(seen.started).toEqual([]);
  });
});
