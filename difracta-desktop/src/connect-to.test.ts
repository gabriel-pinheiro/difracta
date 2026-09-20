import { describe, expect, it } from "vitest";

import { switchSession } from "./connect-to.ts";
import type { LaunchResult } from "./launch-contract.ts";

const ok: LaunchResult = { ok: true };
const no = (reason: string): LaunchResult => ({ ok: false, reason });

/** Runs a switch and tells what was called, in order. */
async function run(options: {
  isCurrent?: boolean;
  check?: LaunchResult;
  leave?: boolean;
  start?: LaunchResult;
}) {
  const calls: string[] = [];
  const step =
    <T>(name: string, value: T) =>
    (): Promise<T> => {
      calls.push(name);
      return Promise.resolve(value);
    };
  const outcome = await switchSession({
    isCurrent: options.isCurrent ?? false,
    check: step("check", options.check ?? ok),
    leave: step("leave", options.leave ?? true),
    start: step("start", options.start ?? ok),
  });
  return { outcome, calls };
}

describe("choosing a target while a session runs", () => {
  it("checks the target before it leaves the session, then starts", async () => {
    expect(await run({})).toEqual({
      outcome: { kind: "started" },
      calls: ["check", "leave", "start"],
    });
  });

  it("does nothing for the runtime already in use", async () => {
    expect(await run({ isCurrent: true })).toEqual({
      outcome: { kind: "current" },
      calls: [],
    });
  });

  it("keeps the session when the target does not answer", async () => {
    expect(await run({ check: no("No Runtime answered.") })).toEqual({
      outcome: { kind: "refused", reason: "No Runtime answered." },
      calls: ["check"],
    });
  });

  it("keeps the session when the person cancels leaving it", async () => {
    expect(await run({ leave: false })).toEqual({
      outcome: { kind: "stayed" },
      calls: ["check", "leave"],
    });
  });

  it("says why when the new session fails after the old one is gone", async () => {
    expect(await run({ start: no("The runtime stopped.") })).toEqual({
      outcome: { kind: "failed", reason: "The runtime stopped." },
      calls: ["check", "leave", "start"],
    });
  });
});
