import type { ShareSignal } from "@difracta/core";

import type { Captured, SendingContext, SharerPeer } from "./share-sending";

/**
 * What the share window's tests stand on, without a browser: peer
 * connections that record what they were told and change state by hand, a
 * captured track of a given size, and a context that keeps what was sent.
 */
export class FakeSharerPeer {
  connectionState: RTCPeerConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate:
    ((event: { candidate: { toJSON(): object } | null }) => void) | null = null;
  localDescription: { sdp: string } | null = null;
  readonly calls: string[] = [];
  encodings: unknown;
  preferred: readonly string[] = [];
  degradation: string | undefined;
  closed = false;
  /** Set to make the offer fail. */
  refuses = false;

  addTransceiver(_track: unknown, init: { sendEncodings?: unknown }) {
    this.encodings = init.sendEncodings;
    this.calls.push("transceiver");
    return {
      setCodecPreferences: (codecs: readonly { mimeType: string }[]) => {
        this.preferred = codecs.map((codec) => codec.mimeType);
      },
    };
  }
  setLocalDescription(): Promise<void> {
    this.calls.push("offer");
    if (this.refuses) return Promise.reject(new Error("no offer"));
    this.localDescription = { sdp: "offer-sdp" };
    return Promise.resolve();
  }
  setRemoteDescription(description: { sdp?: string }): Promise<void> {
    this.calls.push(`remote ${description.sdp ?? ""}`);
    return Promise.resolve();
  }
  addIceCandidate(candidate?: { candidate?: string }): Promise<void> {
    this.calls.push(`ice ${candidate?.candidate ?? "end"}`);
    return Promise.resolve();
  }
  getSenders() {
    return [
      {
        getParameters: () => ({}) as { degradationPreference?: string },
        setParameters: (parameters: { degradationPreference?: string }) => {
          this.degradation = parameters.degradationPreference;
          return Promise.resolve();
        },
      },
    ];
  }
  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }
  /** The connection reaches a state, as the browser would report. */
  reach(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  /** The browser found a candidate, or the last (`null`). */
  candidate(candidate: string | null): void {
    this.onicecandidate?.({
      candidate:
        candidate === null
          ? null
          : { toJSON: () => ({ candidate, sdpMid: "0" }) },
    });
  }
}

/** A captured track of `width` by `height`, which can end as a closed window's does. */
export function fakeCaptured(
  width = 1280,
  height = 720,
  displaySurface = "monitor",
  cursor?: string,
) {
  let stopped = false;
  const track = {
    contentHint: "",
    onended: null as (() => void) | null,
    getSettings: () => ({
      width,
      height,
      displaySurface,
      ...(cursor === undefined ? {} : { cursor }),
    }),
    stop: () => {
      stopped = true;
    },
  };
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };
  return {
    captured: {
      stream: stream as unknown as MediaStream,
      track: track as unknown as MediaStreamTrack,
    } satisfies Captured,
    track,
    stopped: () => stopped,
    /** The shared window closed, or the system stopped the capture. */
    end: () => track.onended?.(),
  };
}

export function fakeSending() {
  const peers: FakeSharerPeer[] = [];
  const sent: { viewerId: string; signal: ShareSignal }[] = [];
  let changes = 0;
  let connections = 0;
  const context: SendingContext = {
    createPeer: () => {
      const peer = new FakeSharerPeer();
      peers.push(peer);
      return peer as unknown as SharerPeer;
    },
    codecs: () =>
      ["video/VP8", "video/rtx", "video/H264", "video/VP9"].map(
        (mimeType) => ({ mimeType }) as RTCRtpCodec,
      ),
    connectionId: () => `c${String((connections += 1))}`,
    signal: (viewerId, signal) => sent.push({ viewerId, signal }),
    changed: () => (changes += 1),
  };
  return {
    context,
    peers,
    sent,
    changes: () => changes,
    /** The last peer made. */
    peer: (): FakeSharerPeer => {
      const peer = peers.at(-1);
      if (peer === undefined) throw new Error("No peer was made.");
      return peer;
    },
  };
}

/** Lets what was queued on promises run. */
export const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
