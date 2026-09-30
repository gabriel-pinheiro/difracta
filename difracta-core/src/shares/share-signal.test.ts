import { describe, expect, it } from "vitest";

import { parseShareSignal, shareCandidate } from "./share-signal.ts";

describe("Share signals", () => {
  it("reads an offer, an answer and candidates, the last one null", () => {
    expect(
      parseShareSignal({ type: "offer", connection: "c1", sdp: "v=0" }),
    ).toEqual({ type: "offer", connection: "c1", sdp: "v=0" });
    expect(
      parseShareSignal({ type: "answer", connection: "c1", sdp: "v=0" }),
    ).toMatchObject({ type: "answer" });
    expect(
      parseShareSignal({
        type: "ice",
        connection: "c1",
        candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
      }),
    ).toEqual({
      type: "ice",
      connection: "c1",
      candidate: {
        candidate: "candidate:1",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      },
    });
    expect(
      parseShareSignal({ type: "ice", connection: "c1", candidate: null }),
    ).toEqual({ type: "ice", connection: "c1", candidate: null });
  });

  it("carries the browser's candidate, every field said", () => {
    expect(shareCandidate(null)).toBeNull();
    expect(shareCandidate({ candidate: "candidate:1", sdpMid: "0" })).toEqual({
      candidate: "candidate:1",
      sdpMid: "0",
      sdpMLineIndex: null,
      usernameFragment: null,
    });
  });

  it("answers undefined for anything else", () => {
    expect(parseShareSignal(undefined)).toBeUndefined();
    expect(parseShareSignal("offer")).toBeUndefined();
    expect(parseShareSignal({ type: "offer", sdp: "v=0" })).toBeUndefined();
    expect(parseShareSignal({ type: "bye", connection: "c1" })).toBeUndefined();
    expect(
      parseShareSignal({ type: "offer", connection: "c1", sdp: 1 }),
    ).toBeUndefined();
  });
});
