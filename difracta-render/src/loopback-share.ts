import { parseShareSignal, shareCandidate } from "@difracta/core";

import type { ShareSignalling, ShareViewingState } from "./live-peer.ts";

/**
 * A Sharer inside the page, for a harness with no runtime and no Desktop:
 * the thumbnails and the GPU suite. Each slot shares the stream it is
 * given, a canvas's as a rule, over a real peer connection to the engine's
 * Viewer in the same page, so what is rendered went through the whole
 * path: offer, answer, candidates, encode, decode, upload. It speaks the
 * same payloads a Sharer does (`ShareSignal` in core) and offers anew when
 * asked.
 */
export function loopbackShares(
  streams: Readonly<Record<string, MediaStream>>,
): ShareSignalling {
  const viewing = new Set<(id: string, state: ShareViewingState) => void>();
  const signals = new Set<(id: string, payload: unknown) => void>();
  const states = new Map<string, ShareViewingState>();
  const peers = new Map<
    string,
    { connection: string; peer: RTCPeerConnection }
  >();
  let offers = 0;

  const deliver = (id: string, payload: unknown): void => {
    for (const listener of signals) listener(id, payload);
  };
  const drop = (id: string): void => {
    peers.get(id)?.peer.close();
    peers.delete(id);
  };
  const offer = (id: string, stream: MediaStream): void => {
    drop(id);
    offers += 1;
    const connection = `loopback-${String(offers)}`;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peers.set(id, { connection, peer });
    for (const track of stream.getVideoTracks())
      peer.addTransceiver(track, { direction: "sendonly", streams: [stream] });
    peer.onicecandidate = (event) => {
      deliver(id, {
        type: "ice",
        connection,
        candidate: shareCandidate(event.candidate?.toJSON() ?? null),
      });
    };
    void peer
      .setLocalDescription()
      .then(() => {
        const sdp = peer.localDescription?.sdp;
        if (sdp !== undefined) deliver(id, { type: "offer", connection, sdp });
      })
      .catch((error: unknown) => {
        console.error(`Loopback share “${id}” could not offer:`, error);
      });
  };
  const say = (id: string): void => {
    const stream = streams[id];
    const state: ShareViewingState =
      stream === undefined
        ? { status: "idle" }
        : { status: "live", share: `loopback-${id}` };
    states.set(id, state);
    // As the runtime would: the answer arrives after `view` returned.
    queueMicrotask(() => {
      if (states.get(id) !== state) return;
      for (const listener of viewing) listener(id, state);
      if (stream !== undefined) offer(id, stream);
    });
  };

  return {
    view: say,
    leave(id) {
      states.delete(id);
      drop(id);
    },
    requestOffer(id) {
      if (!states.has(id)) return false;
      say(id);
      return true;
    },
    signal(id, payload) {
      const current = peers.get(id);
      const signal = parseShareSignal(payload);
      if (current === undefined || signal?.connection !== current.connection)
        return false;
      const { peer } = current;
      const done =
        signal.type === "answer"
          ? peer.setRemoteDescription({ type: "answer", sdp: signal.sdp })
          : signal.type === "ice"
            ? peer.addIceCandidate(signal.candidate ?? undefined)
            : Promise.resolve();
      done.catch((error: unknown) => {
        console.error(`Loopback share “${id}” could not connect:`, error);
      });
      return true;
    },
    state: (id) => states.get(id),
    onViewing(listener) {
      viewing.add(listener);
      return () => viewing.delete(listener);
    },
    onSignal(listener) {
      signals.add(listener);
      return () => signals.delete(listener);
    },
  };
}
