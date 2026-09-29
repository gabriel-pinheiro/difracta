import type { ClientMessage, ShareViewing } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { Viewing } from "./viewing.ts";

function viewing(): { side: Viewing; sent: ClientMessage[] } {
  const sent: ClientMessage[] = [];
  return { side: new Viewing((message) => sent.push(message) > 0), sent };
}

describe("the Viewer side of a connection", () => {
  it("views, asks for a new offer, leaves, and asks again after a reconnect", () => {
    const { side, sent } = viewing();
    side.view("m_a");
    side.view("m_a");
    side.view("m_b");
    expect(side.requestOffer("m_a")).toBe(true);
    expect(side.requestOffer("m_z")).toBe(false);
    side.leave("m_b");
    side.leave("m_b");
    expect(sent).toEqual([
      { type: "share-view", mediaId: "m_a", view: true },
      { type: "share-view", mediaId: "m_b", view: true },
      { type: "share-view", mediaId: "m_a", view: true },
      { type: "share-view", mediaId: "m_b", view: false },
    ]);
    sent.length = 0;
    side.receive({
      type: "share-viewing",
      mediaId: "m_a",
      viewing: { status: "refused", error: "Full." },
    });
    side.resend();
    expect(sent).toEqual([{ type: "share-view", mediaId: "m_a", view: true }]);
  });

  it("keeps where it stands with each slot and hears the Sharer's payloads", () => {
    const { side, sent } = viewing();
    const heard: [string, ShareViewing][] = [];
    const payloads: unknown[] = [];
    side.onViewing((mediaId, state) => heard.push([mediaId, state]));
    side.onSignal((mediaId, payload) => payloads.push([mediaId, payload]));
    side.view("m_a");
    expect(side.state("m_a")).toBeUndefined();
    side.receive({
      type: "share-viewing",
      mediaId: "m_a",
      viewing: { status: "live", share: "share_1" },
    });
    side.receive({
      type: "share-viewing",
      mediaId: "m_other",
      viewing: { status: "idle" },
    });
    side.receive({
      type: "share-signal",
      mediaId: "m_a",
      payload: { sdp: "offer" },
    });
    expect(side.signal("m_a", { sdp: "answer" })).toBe(true);
    expect(side.state("m_a")).toEqual({ status: "live", share: "share_1" });
    expect(heard).toEqual([["m_a", { status: "live", share: "share_1" }]]);
    expect(payloads).toEqual([["m_a", { sdp: "offer" }]]);
    expect(sent.at(-1)).toEqual({
      type: "share-signal",
      mediaId: "m_a",
      payload: { sdp: "answer" },
    });
    side.leave("m_a");
    expect(side.state("m_a")).toBeUndefined();
  });
});
