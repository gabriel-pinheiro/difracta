import type { Output, Table } from "@difracta/core";
import type { OutputSessionLive } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { emphasizedOutput } from "./output-emphasis";

const outputs = {
  side: { id: "side", name: "Side", order: "a1" },
  wall: { id: "wall", name: "Wall", order: "a0" },
} as unknown as Table<Output>;

function session(outputId: string, stale: boolean): OutputSessionLive {
  return {
    sessionId: `session-${outputId}`,
    outputId,
    connectedAt: 10,
    reportedAt: 20,
    stale,
    telemetry: null,
  };
}

function sessions(outputId: string, stale: boolean) {
  const entry = session(outputId, stale);
  return { sessions: { [entry.sessionId]: entry } };
}

describe("the Output whose Open button draws the eye", () => {
  it("is none while the Installation has no Outputs", () => {
    expect(emphasizedOutput({}, undefined)).toBeUndefined();
  });

  it("is the first Output in navigator order while nothing is connected", () => {
    expect(emphasizedOutput(outputs, undefined)).toBe("wall");
    expect(emphasizedOutput(outputs, {})).toBe("wall");
    expect(emphasizedOutput(outputs, { wall: {} })).toBe("wall");
  });

  it("is none once an Output has a live session", () => {
    expect(
      emphasizedOutput(outputs, { wall: sessions("wall", false) }),
    ).toBeUndefined();
  });

  it("still asks while only stale sessions remain", () => {
    expect(
      emphasizedOutput(outputs, {
        wall: sessions("wall", true),
        side: sessions("side", true),
      }),
    ).toBe("wall");
  });

  it("is none when a later Output is the live one", () => {
    expect(
      emphasizedOutput(outputs, {
        wall: sessions("wall", true),
        side: sessions("side", false),
      }),
    ).toBeUndefined();
  });
});
