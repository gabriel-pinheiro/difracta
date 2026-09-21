import type { LiveState, OutputSessionLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { countOutputSessions, outputsWarning } from "./output-sessions.ts";

function session(
  sessionId: string,
  outputId: string,
  stale = false,
): OutputSessionLive {
  return {
    sessionId,
    outputId,
    connectedAt: 1,
    reportedAt: stale ? 2 : null,
    stale,
    telemetry: null,
  };
}

function live(...sessions: OutputSessionLive[]): LiveState {
  const outputs: LiveState["outputs"] = {};
  for (const entry of sessions)
    (outputs[entry.outputId] ??= { sessions: {} }).sessions[entry.sessionId] =
      entry;
  return { osc: { port: null, listeners: 0 }, outputs };
}

describe("Output Sessions attached to the runtime", () => {
  it("counts every session of every Output", () => {
    expect(countOutputSessions(live())).toBe(0);
    expect(
      countOutputSessions(
        live(session("a", "wall"), session("b", "wall"), session("c", "floor")),
      ),
    ).toBe(3);
  });

  it("leaves out the stale ones, which nobody is watching", () => {
    expect(
      countOutputSessions(
        live(session("a", "wall"), session("gone", "wall", true)),
      ),
    ).toBe(1);
  });

  it("words the warning for one and for many, for quitting and for switching", () => {
    expect(outputsWarning(1, "quit")).toEqual({
      message: "1 Output is showing from this computer.",
      detail: "Quitting stops it.",
      confirm: "Quit",
    });
    expect(outputsWarning(2, "switch")).toEqual({
      message: "2 Outputs are showing from this computer.",
      detail: "Switching stops them.",
      confirm: "Switch",
    });
  });
});
