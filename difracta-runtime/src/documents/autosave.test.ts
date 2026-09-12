import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Autosave } from "./autosave.ts";

let writes = 0;
let outcome = true;

function autosave(delayMs: number, maxWaitMs: number): Autosave {
  return new Autosave({
    delayMs,
    maxWaitMs,
    write: () => {
      writes += 1;
      return Promise.resolve(outcome);
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  writes = 0;
  outcome = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Autosave", () => {
  it("restarts the delay on every change and writes once after the last", async () => {
    const clock = autosave(100, 1_000);
    clock.changed();
    await vi.advanceTimersByTimeAsync(60);
    clock.changed();
    await vi.advanceTimersByTimeAsync(60);
    clock.changed();
    await vi.advanceTimersByTimeAsync(99);
    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toBe(1);
  });

  it("writes by the max wait while changes keep coming", async () => {
    const clock = autosave(100, 250);
    for (let tick = 0; tick < 12; tick += 1) {
      clock.changed();
      await vi.advanceTimersByTimeAsync(50);
    }
    // Deadlines at 250 and 500; the last change at 550 trails at 650.
    expect(writes).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toBe(3);
  });

  it("flushes only what is unwritten and retries a failed write", async () => {
    const clock = autosave(100, 1_000);
    // A fresh clock holds nothing: a document that opened dirty gets written.
    await clock.flush();
    await clock.flush();
    expect(writes).toBe(1);
    clock.changed();
    await clock.flush();
    await clock.flush();
    expect(writes).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(writes).toBe(2);

    outcome = false;
    clock.changed();
    await clock.flush();
    outcome = true;
    await clock.flush();
    expect(writes).toBe(4);
  });

  it("runs writes one after another", async () => {
    let release: (() => void) | undefined;
    const clock = new Autosave({
      delayMs: 10,
      maxWaitMs: 100,
      write: () => {
        writes += 1;
        return new Promise((resolve) => {
          release = () => resolve(true);
        });
      },
    });
    clock.changed();
    const first = clock.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toBe(1);

    // A change while the first write is in flight waits for it to land.
    clock.changed();
    const second = clock.flush();
    let settled = false;
    void second.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toBe(1);
    release?.();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toBe(2);
    expect(settled).toBe(false);
    release?.();
    await second;
    expect(settled).toBe(true);
  });
});
