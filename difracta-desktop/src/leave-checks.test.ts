import { describe, expect, it } from "vitest";

import {
  mayLeave,
  type LeaveChecks,
  type UnsavedAnswer,
} from "./leave-checks.ts";

/** Checks with scripted answers, and the order in which they were used. */
function scripted(answers: {
  readonly unsaved?: UnsavedAnswer;
  readonly sessions?: number;
  readonly warned?: boolean;
  readonly saved?: boolean;
  readonly where?: Partial<
    Pick<LeaveChecks, "local" | "attended" | "connected">
  >;
}): { readonly checks: LeaveChecks; readonly calls: string[] } {
  const calls: string[] = [];
  const said = <T>(call: string, value: T) => {
    calls.push(call);
    return Promise.resolve(value);
  };
  return {
    calls,
    checks: {
      local: true,
      attended: true,
      connected: true,
      ...answers.where,
      outputSessions: () => said("count", answers.sessions ?? 0),
      askUnsaved: () => said("ask", answers.unsaved ?? "clean"),
      save: () => said("save", answers.saved ?? true),
      warnOutputs: (count) =>
        said(`warn ${String(count)}`, answers.warned ?? true),
      discard: () => said("discard", true),
    },
  };
}

describe("leaving a session", () => {
  it("asks nothing with nothing unsaved and nothing showing", async () => {
    const { checks, calls } = scripted({});
    expect(await mayLeave(checks)).toBe(true);
    expect(calls).toEqual(["count", "ask"]);
  });

  it("asks about unsaved changes first, then warns about the Outputs", async () => {
    const { checks, calls } = scripted({ unsaved: "save", sessions: 2 });
    expect(await mayLeave(checks)).toBe(true);
    expect(calls).toEqual(["count", "ask", "save", "warn 2"]);
  });

  it("stays on Cancel to unsaved changes, without the second question", async () => {
    const { checks, calls } = scripted({ unsaved: "cancel", sessions: 2 });
    expect(await mayLeave(checks)).toBe(false);
    expect(calls).toEqual(["count", "ask"]);
  });

  it("stays when the save did not happen", async () => {
    const { checks, calls } = scripted({
      unsaved: "save",
      saved: false,
      sessions: 1,
    });
    expect(await mayLeave(checks)).toBe(false);
    expect(calls).toEqual(["count", "ask", "save"]);
  });

  it("throws nothing away when the Outputs warning is cancelled", async () => {
    const { checks, calls } = scripted({
      unsaved: "discard",
      sessions: 1,
      warned: false,
    });
    expect(await mayLeave(checks)).toBe(false);
    expect(calls).toEqual(["count", "ask", "warn 1"]);
  });

  it("discards only once both questions are answered", async () => {
    const { checks, calls } = scripted({ unsaved: "discard", sessions: 1 });
    expect(await mayLeave(checks)).toBe(true);
    expect(calls).toEqual(["count", "ask", "warn 1", "discard"]);
  });

  it("asks nothing of a runtime elsewhere, of nobody, or of a runtime that is gone", async () => {
    for (const where of [
      { local: false },
      // `--no-studio`, stopped by SIGTERM: no window, so nobody to answer.
      { attended: false },
      { connected: false },
    ]) {
      const { checks, calls } = scripted({
        unsaved: "save",
        sessions: 3,
        where,
      });
      expect(await mayLeave(checks)).toBe(true);
      expect(calls).toEqual([]);
    }
  });
});
