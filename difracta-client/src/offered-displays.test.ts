import type { ClientMessage, DisplayHostReport } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { OfferedDisplays } from "./offered-displays.ts";

const report: DisplayHostReport = {
  name: "Stage PC",
  displays: [],
  showing: {},
};

function offered(): { displays: OfferedDisplays; sent: ClientMessage[] } {
  const sent: ClientMessage[] = [];
  return {
    displays: new OfferedDisplays((message) => sent.push(message) > 0),
    sent,
  };
}

describe("the Displays a Desktop connection offers", () => {
  it("offers again after a reconnect until withdrawn", () => {
    const { displays, sent } = offered();
    displays.resend();
    expect(sent).toEqual([]);
    displays.offer(report);
    displays.resend();
    expect(sent).toEqual([
      { type: "display-host", host: report },
      { type: "display-host", host: report },
    ]);
    displays.withdraw();
    displays.withdraw();
    displays.resend();
    expect(sent.slice(2)).toEqual([{ type: "display-host", host: null }]);
  });

  it("answers a request with what the handler says, a throw included", async () => {
    const { displays, sent } = offered();
    const request = { action: "hide", display: "1" } as const;
    await displays.receive({
      type: "display-request",
      requestId: "d1",
      request,
    });
    displays.onAction((action) => {
      if (action.action === "hide") throw new Error("No window there.");
      return Promise.resolve({ ok: true });
    });
    await displays.receive({
      type: "display-request",
      requestId: "d2",
      request,
    });
    await displays.receive({
      type: "display-request",
      requestId: "d3",
      request: { action: "show", display: "1", output: "out_a" },
    });
    expect(sent).toEqual([
      {
        type: "display-reply",
        requestId: "d1",
        outcome: {
          ok: false,
          error: "This Display Host does not show Outputs.",
        },
      },
      {
        type: "display-reply",
        requestId: "d2",
        outcome: { ok: false, error: "No window there." },
      },
      { type: "display-reply", requestId: "d3", outcome: { ok: true } },
    ]);
  });
});
