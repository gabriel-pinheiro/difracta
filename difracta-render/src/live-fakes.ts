import type {
  LivePeer,
  LiveTimers,
  ShareSignalling,
  ShareViewingState,
} from "./live-peer.ts";

/**
 * What the Viewer's tests stand on, without a browser: signalling that
 * records what it was asked and lets the test speak for the runtime and
 * the Sharer, peer connections that record what they were told and change
 * state by hand, a video element that presents frames by hand, and timers
 * that say how long each waits.
 */
export function fakeSignalling() {
  const calls: string[] = [];
  const sent: { id: string; payload: unknown }[] = [];
  const states = new Map<string, ShareViewingState>();
  const viewing = new Set<(id: string, viewing: ShareViewingState) => void>();
  const signals = new Set<(id: string, payload: unknown) => void>();
  const signalling: ShareSignalling = {
    view: (id) => calls.push(`view ${id}`),
    leave: (id) => {
      states.delete(id);
      calls.push(`leave ${id}`);
    },
    requestOffer: (id) => calls.push(`ask ${id}`) > 0,
    signal: (id, payload) => sent.push({ id, payload }) > 0,
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
  return {
    signalling,
    calls,
    sent,
    listeners: () => viewing.size + signals.size,
    /** The runtime says where the Viewer stands. */
    say(id: string, state: ShareViewingState): void {
      states.set(id, state);
      for (const listener of viewing) listener(id, state);
    },
    /** The Sharer sends a payload. */
    deliver(id: string, payload: unknown): void {
      for (const listener of signals) listener(id, payload);
    },
  };
}

export class FakePeer {
  connectionState: RTCPeerConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate:
    ((event: { candidate: { toJSON(): object } | null }) => void) | null = null;
  ontrack:
    ((event: { track: object; streams: readonly object[] }) => void) | null =
    null;
  localDescription: { sdp: string } | null = null;
  readonly calls: string[] = [];
  closed = false;
  /** Set to make the next `setRemoteDescription` fail. */
  refuses = false;

  setRemoteDescription(description: { sdp?: string }): Promise<void> {
    this.calls.push(`remote ${description.sdp ?? ""}`);
    return this.refuses
      ? Promise.reject(new Error("bad offer"))
      : Promise.resolve();
  }
  createAnswer(): Promise<{ type: "answer"; sdp: string }> {
    this.calls.push("answer");
    return Promise.resolve({ type: "answer", sdp: "answer-sdp" });
  }
  setLocalDescription(description: { sdp: string }): Promise<void> {
    this.localDescription = description;
    this.calls.push("local");
    return Promise.resolve();
  }
  addIceCandidate(candidate?: { candidate?: string }): Promise<void> {
    this.calls.push(`ice ${candidate?.candidate ?? "end"}`);
    return Promise.resolve();
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
  /** The Sharer's track arrives. */
  track(stream: object = { stream: true }): void {
    this.ontrack?.({ track: {}, streams: [stream] });
  }
}

export class FakeLiveElement {
  muted = false;
  srcObject: object | null = null;
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  plays = 0;
  readonly #callbacks = new Map<number, () => void>();
  #next = 1;
  addEventListener(): void {
    // Frames are counted through `requestVideoFrameCallback` here.
  }
  removeEventListener(): void {
    // See `addEventListener`.
  }
  requestVideoFrameCallback(callback: () => void): number {
    const handle = this.#next++;
    this.#callbacks.set(handle, callback);
    return handle;
  }
  cancelVideoFrameCallback(handle: number): void {
    this.#callbacks.delete(handle);
  }
  get counting(): boolean {
    return this.#callbacks.size > 0;
  }
  play(): Promise<void> {
    this.plays += 1;
    return Promise.resolve();
  }
  /** One frame presented, as the browser would report. */
  present(width = 1280, height = 720): void {
    this.videoWidth = width;
    this.videoHeight = height;
    this.readyState = 2;
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    for (const callback of callbacks) callback();
  }
}

export function fakeLiveTimers() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  const timers: LiveTimers = {
    set(callback, ms) {
      pending.set(next, { callback, ms });
      return next++;
    },
    clear(timer) {
      pending.delete(timer as number);
    },
  };
  return {
    timers,
    /** How long each pending timer waits, in the order they were set. */
    waits: (): number[] => [...pending.values()].map((timer) => timer.ms),
    /** Every timer now pending runs out; the ones they set stay pending. */
    expire(): void {
      const due = [...pending.values()];
      pending.clear();
      for (const { callback } of due) callback();
    },
  };
}

/** Everything a Viewer is made with, and the peers and elements it made. */
export function fakeLivePage() {
  const signalling = fakeSignalling();
  const timers = fakeLiveTimers();
  const peers: FakePeer[] = [];
  const elements: FakeLiveElement[] = [];
  return {
    ...signalling,
    timers,
    peers,
    elements,
    peer(index = peers.length - 1): FakePeer {
      const peer = peers[index];
      if (peer === undefined) throw new Error("No peer connection was made.");
      return peer;
    },
    element(index = elements.length - 1): FakeLiveElement {
      const element = elements[index];
      if (element === undefined) throw new Error("No element was made.");
      return element;
    },
    options: {
      signalling: signalling.signalling,
      timers: timers.timers,
      createPeer: (): LivePeer => {
        const peer = new FakePeer();
        peers.push(peer);
        return peer as unknown as LivePeer;
      },
      createElement: (): HTMLVideoElement => {
        const element = new FakeLiveElement();
        elements.push(element);
        return element as unknown as HTMLVideoElement;
      },
    },
  };
}

/** Lets the promises a signal set off run to their end. */
export const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};
