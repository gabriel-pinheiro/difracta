import type { ClientMessage, ShareDeclaration } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { Sharing, type ShareEnd, type ShareViewerChange } from "./sharing.ts";

const screen: ShareDeclaration = { sharer: "Laptop", source: "screen" };

function sharing(connected = true): {
  side: Sharing;
  sent: ClientMessage[];
  connect: (value: boolean) => void;
} {
  const sent: ClientMessage[] = [];
  let open = connected;
  const side = new Sharing((message) => {
    if (!open) return false;
    sent.push(message);
    return true;
  });
  return { side, sent, connect: (value) => (open = value) };
}

describe("the Sharer side of a connection", () => {
  it("declares each slot, stops one, and declares the rest again after a reconnect as a resume", () => {
    const { side, sent } = sharing();
    side.share("m_a", screen);
    side.share("m_b", { ...screen, source: "window" });
    side.stop("m_a");
    side.stop("m_a");
    expect(side.slots()).toEqual(["m_b"]);
    sent.length = 0;
    side.resend();
    expect(sent).toEqual([
      {
        type: "share",
        mediaId: "m_b",
        share: { sharer: "Laptop", source: "window" },
        resume: true,
      },
    ]);
  });

  it("does not call a share declared while away a resume", () => {
    const { side, sent, connect } = sharing(false);
    side.share("m_a", screen);
    expect(sent).toEqual([]);
    connect(true);
    side.resend();
    side.resend();
    expect(sent).toEqual([
      { type: "share", mediaId: "m_a", share: screen },
      { type: "share", mediaId: "m_a", share: screen, resume: true },
    ]);
  });

  it("hears Viewers, their payloads and an end, then forgets that share", () => {
    const { side, sent } = sharing();
    const changes: ShareViewerChange[] = [];
    const ends: ShareEnd[] = [];
    const payloads: unknown[] = [];
    side.onViewer((change) => changes.push(change));
    side.onEnded((end) => ends.push(end));
    side.onSignal((mediaId, viewerId, payload) =>
      payloads.push([mediaId, viewerId, payload]),
    );
    side.share("m_a", screen);
    side.receive({
      type: "share-viewer",
      mediaId: "m_a",
      viewerId: "v1",
      joined: true,
    });
    // Nothing about a slot this side does not share into.
    side.receive({
      type: "share-viewer",
      mediaId: "m_z",
      viewerId: "v1",
      joined: true,
    });
    side.receive({
      type: "share-signal",
      mediaId: "m_a",
      viewerId: "v1",
      payload: { sdp: "answer" },
    });
    expect(side.signal("m_a", "v1", { sdp: "offer" })).toBe(true);
    side.receive({
      type: "share-ended",
      mediaId: "m_a",
      reason: "replaced",
      message: "Booth shares into “Slides” now.",
    });
    expect(changes).toEqual([{ mediaId: "m_a", viewerId: "v1", joined: true }]);
    expect(payloads).toEqual([["m_a", "v1", { sdp: "answer" }]]);
    expect(ends).toEqual([
      {
        mediaId: "m_a",
        reason: "replaced",
        message: "Booth shares into “Slides” now.",
      },
    ]);
    expect(side.slots()).toEqual([]);
    expect(sent.at(-1)).toEqual({
      type: "share-signal",
      mediaId: "m_a",
      viewerId: "v1",
      payload: { sdp: "offer" },
    });
    // A replaced share is not declared again after a reconnect.
    sent.length = 0;
    side.resend();
    expect(sent).toEqual([]);
  });
});
