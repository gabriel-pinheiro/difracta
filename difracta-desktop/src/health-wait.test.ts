import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { waitForHealth } from "./health-wait.ts";

const healthy = (): Promise<Response> =>
  Promise.resolve(Response.json({ name: "Difracta Runtime" }));
const refused = (): Promise<Response> =>
  Promise.reject(new TypeError("fetch failed"));

/** A clock that only moves when the wait sleeps. */
function fakeTime() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: (ms: number) => {
      sleeps.push(ms);
      time += ms;
      return Promise.resolve();
    },
  };
}

describe("waiting for /health", () => {
  it("returns at once when the runtime already answers", async () => {
    const time = fakeTime();
    const result = await waitForHealth({ url: "h", fetch: healthy, ...time });
    expect(result).toEqual({ ok: true });
    expect(time.sleeps).toEqual([]);
  });

  it("retries with a doubling, capped delay until it answers", async () => {
    const time = fakeTime();
    let attempts = 0;
    const result = await waitForHealth({
      url: "h",
      fetch: () => (++attempts < 7 ? refused() : healthy()),
      ...time,
    });
    expect(result).toEqual({ ok: true });
    const { healthPollInitialMs: first, healthPollMaxMs: max } =
      settings.desktop;
    expect(time.sleeps.slice(0, 2)).toEqual([first, first * 2]);
    expect(Math.max(...time.sleeps)).toBe(max);
  });

  it("does not take another server on the port for the runtime", async () => {
    const time = fakeTime();
    const result = await waitForHealth({
      url: "h",
      timeoutMs: 1_000,
      fetch: () => Promise.resolve(Response.json({ name: "Something else" })),
      ...time,
    });
    expect(result.ok).toBe(false);
  });

  it("gives up after the timeout, saying so", async () => {
    const time = fakeTime();
    const result = await waitForHealth({
      url: "h",
      timeoutMs: 2_000,
      fetch: refused,
      ...time,
    });
    expect(result).toEqual({
      ok: false,
      reason: "The runtime did not answer within 2 seconds.",
    });
    expect(time.now()).toBeGreaterThanOrEqual(2_000);
  });

  it("stops as soon as the runtime is known to be gone", async () => {
    const time = fakeTime();
    let attempts = 0;
    const result = await waitForHealth({
      url: "h",
      fetch: () => {
        attempts += 1;
        return refused();
      },
      givenUp: () => (attempts >= 2 ? "The runtime exited." : undefined),
      ...time,
    });
    expect(result).toEqual({ ok: false, reason: "The runtime exited." });
    expect(attempts).toBe(2);
  });
});
