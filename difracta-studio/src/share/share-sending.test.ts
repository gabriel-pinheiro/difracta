import { settings } from "@difracta/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCaptured, fakeSending, settle } from "./share-fakes";
import { ShareSending } from "./share-sending";

const { qualities } = settings.shares.sharer;

function sending(quality: "sharp" | "smooth" = "sharp", width = 1280) {
  const page = fakeSending();
  const { captured } = fakeCaptured(width, (width * 9) / 16);
  return { page, send: new ShareSending(captured, quality, page.context) };
}

describe("A share's connections", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("offers to a Viewer the runtime announced, encoded as the quality says", async () => {
    const { page, send } = sending("sharp");
    send.joined("v1");
    await settle();
    expect(page.peer().encodings).toEqual([
      {
        maxBitrate: qualities.sharp.maxBitrate,
        maxFramerate: qualities.sharp.frameRate,
        scaleResolutionDownBy: 1,
      },
    ]);
    expect(page.peer().preferred).toEqual([
      "video/VP9",
      "video/VP8",
      "video/H264",
      "video/rtx",
    ]);
    expect(page.sent).toEqual([
      {
        viewerId: "v1",
        signal: { type: "offer", connection: "c1", sdp: "offer-sdp" },
      },
    ]);
    expect(send.viewers()).toEqual({ offered: 1, connected: 0 });
  });

  it("scales a capture larger than the limit down in the encoding", () => {
    const { page, send } = sending("smooth", 3840);
    send.joined("v1");
    expect(page.peer().encodings).toMatchObject([{ scaleResolutionDownBy: 2 }]);
    expect(page.peer().preferred[0]).toBe("video/VP8");
  });

  it("takes the answer and says what gives way, then the candidates, in order", async () => {
    const { page, send } = sending("smooth");
    send.joined("v1");
    send.signal("v1", { type: "answer", connection: "c1", sdp: "answer-sdp" });
    send.signal("v1", {
      type: "ice",
      connection: "c1",
      candidate: { candidate: "a" },
    });
    send.signal("v1", { type: "ice", connection: "c1", candidate: null });
    await settle();
    expect(page.peer().calls).toEqual([
      "transceiver",
      "offer",
      "remote answer-sdp",
      "ice a",
      "ice end",
    ]);
    expect(page.peer().degradation).toBe(
      qualities.smooth.degradationPreference,
    );
  });

  it("sends its own candidates under the connection's id", async () => {
    const { page, send } = sending();
    send.joined("v1");
    await settle();
    page.peer().candidate("mine");
    page.peer().candidate(null);
    expect(page.sent.slice(1).map((entry) => entry.signal)).toEqual([
      {
        type: "ice",
        connection: "c1",
        candidate: {
          candidate: "mine",
          sdpMid: "0",
          sdpMLineIndex: null,
          usernameFragment: null,
        },
      },
      { type: "ice", connection: "c1", candidate: null },
    ]);
  });

  it("makes a connection from scratch for a Viewer announced again", async () => {
    const { page, send } = sending();
    send.joined("v1");
    await settle();
    const [first] = page.peers;
    send.joined("v1");
    await settle();
    expect(first?.closed).toBe(true);
    expect(page.peers).toHaveLength(2);
    expect(page.sent.at(-1)?.signal).toMatchObject({
      type: "offer",
      connection: "c2",
    });
    // What was meant for the connection before is dropped.
    send.signal("v1", { type: "answer", connection: "c1", sdp: "late" });
    await settle();
    expect(page.peer().calls).toEqual(["transceiver", "offer"]);
    first?.candidate("late");
    expect(page.sent).toHaveLength(2);
    expect(send.viewers().offered).toBe(1);
  });

  it("drops what is not a signal, and what is for a Viewer it does not know", async () => {
    const { page, send } = sending();
    send.joined("v1");
    await settle();
    send.signal("v1", { type: "answer", sdp: "no id" });
    send.signal("v1", "nonsense");
    send.signal("v2", { type: "answer", connection: "c1", sdp: "x" });
    await settle();
    expect(page.peer().calls).toEqual(["transceiver", "offer"]);
  });

  it("counts the Viewers whose picture arrives, and drops a connection that failed", async () => {
    const { page, send } = sending();
    send.joined("v1");
    send.joined("v2");
    await settle();
    const [one, two] = page.peers;
    one?.reach("connected");
    two?.reach("connecting");
    expect(send.viewers()).toEqual({ offered: 2, connected: 1 });
    const before = page.changes();
    one?.reach("failed");
    expect(one?.closed).toBe(true);
    expect(send.viewers()).toEqual({ offered: 1, connected: 0 });
    expect(page.changes()).toBeGreaterThan(before);
  });

  it("closes the connection of a Viewer that left", async () => {
    const { page, send } = sending();
    send.joined("v1");
    await settle();
    send.left("v1");
    send.left("v1");
    expect(page.peer().closed).toBe(true);
    expect(send.viewers()).toEqual({ offered: 0, connected: 0 });
  });

  it("drops a connection whose offer could not be made", async () => {
    const page = fakeSending();
    const send = new ShareSending(fakeCaptured().captured, "sharp", {
      ...page.context,
      createPeer: () => {
        const peer = page.context.createPeer();
        page.peer().refuses = true;
        return peer;
      },
    });
    send.joined("v1");
    await settle();
    expect(page.sent).toEqual([]);
    expect(page.peer().closed).toBe(true);
    expect(send.viewers().offered).toBe(0);
  });

  it("closes every connection and makes no more once closed", async () => {
    const { page, send } = sending();
    send.joined("v1");
    send.joined("v2");
    await settle();
    send.close();
    expect(page.peers.every((peer) => peer.closed)).toBe(true);
    send.joined("v3");
    expect(page.peers).toHaveLength(2);
  });
});
