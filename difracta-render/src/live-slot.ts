import {
  parseShareSignal,
  settings,
  shareCandidate,
  type ShareSignal,
} from "@difracta/core";

import type {
  LivePeer,
  LiveTimers,
  ShareSignalling,
  ShareViewingState,
} from "./live-peer.ts";
import { countVideoFrames, type FrameCounting } from "./media-video.ts";
import type { MediaLive } from "./sdk/media.ts";

export interface SlotContext {
  readonly signalling: ShareSignalling;
  readonly createPeer: () => LivePeer;
  readonly createElement: () => HTMLVideoElement;
  readonly timers: LiveTimers;
}

/** Where the peer connection in hand stands; `none` while there is none. */
type Link = "none" | "connecting" | "connected" | "disconnected" | "failed";

const LINKS: Partial<Record<RTCPeerConnectionState, Link>> = {
  new: "connecting",
  connecting: "connecting",
  connected: "connected",
  disconnected: "disconnected",
  failed: "failed",
};

/**
 * One Screen Share as this page views it: a video element the share's
 * stream plays in, and the one receive-only peer connection that feeds it.
 * The Sharer offers and this side answers; a new offer replaces the
 * connection in hand, and so does a share under another id, which waits
 * for its Sharer's offer. While the runtime says somebody shares and the
 * connection is not up or on its way, the slot asks the Sharer for a new
 * offer, at once when the connection failed, after
 * `askAfterDisconnectedMs` when it is `disconnected`, and again every
 * `askEveryMs` until an offer arrives, since one asked while the Sharer is
 * away reaches nobody. An `interrupted` share keeps its connection: the
 * picture never went through the runtime. A refused Viewer asks to view
 * again every `retryRefusedMs`.
 *
 * The element keeps the last frame of a connection that dropped, which is
 * what `lost` tells the instance, from the drop until the connection is
 * back or the one that replaces it presents a frame, so a picture the
 * instance gave up on does not show again while a new connection is made.
 * It is emptied when nobody shares.
 */
export class LiveSlot {
  readonly id: string;
  readonly live: MediaLive;
  readonly #context: SlotContext;
  readonly #element: HTMLVideoElement;
  readonly #frames: FrameCounting;
  #viewing: ShareViewingState | undefined;
  #share: string | undefined;
  #peer: LivePeer | undefined;
  #connection: string | undefined;
  /** What the connection in hand still has to do, in order. */
  #queue: Promise<void> = Promise.resolve();
  #link: Link = "none";
  /** A frame of the share in hand, or of the one before it, is in the element. */
  #picture = false;
  /** The picture is of a connection that dropped, and nothing took its place yet. */
  #stale = false;
  /** The connection in hand presented a frame of its own. */
  #presented = false;
  #askTimer: unknown;
  #closed = false;

  constructor(id: string, context: SlotContext) {
    this.id = id;
    this.#context = context;
    const element = context.createElement();
    this.#element = element;
    const frames = countVideoFrames(element, () => {
      if (this.#share === undefined) return;
      this.#picture = true;
      this.#presented = true;
      this.#stale = false;
    });
    this.#frames = frames;
    const shown = (): boolean => this.#picture;
    const stale = (): boolean => this.#stale;
    this.live = {
      handle: {
        id,
        get image() {
          return shown() ? element : null;
        },
        get width() {
          return element.videoWidth;
        },
        get height() {
          return element.videoHeight;
        },
        get version() {
          return shown() ? frames.version() : 0;
        },
      },
      get lost() {
        return shown() && stale();
      },
    };
  }

  get connected(): boolean {
    return this.#link === "connected";
  }

  /** Why the runtime refused this Viewer, while it does. */
  get refused(): string | undefined {
    return this.#viewing?.status === "refused"
      ? this.#viewing.error
      : undefined;
  }

  /** What the runtime says about the slot now. */
  viewing(viewing: ShareViewingState): void {
    if (this.#closed) return;
    this.#viewing = viewing;
    if (viewing.status === "idle" || viewing.status === "refused") {
      this.#share = undefined;
      this.#drop();
      this.#empty();
    } else if (viewing.share !== this.#share) {
      // Another share: its Sharer offers, to a Viewer it was just told of.
      this.#share = viewing.share;
      this.#drop();
    }
    this.#watch();
  }

  /** A payload from the slot's Sharer. */
  signal(payload: unknown): void {
    if (this.#closed) return;
    const signal = parseShareSignal(payload);
    if (signal?.type === "offer") this.#answer(signal);
    else if (signal?.type === "ice" && signal.connection === this.#connection)
      this.#then(this.#peer, (peer) =>
        peer.addIceCandidate(signal.candidate ?? undefined),
      );
  }

  close(): void {
    this.#closed = true;
    this.#context.timers.clear(this.#askTimer);
    this.#drop();
    this.#empty();
    this.#frames.stop();
  }

  #answer(offer: ShareSignal & { type: "offer" }): void {
    this.#drop();
    const peer = this.#context.createPeer();
    const connection = offer.connection;
    this.#peer = peer;
    this.#connection = connection;
    this.#link = "connecting";
    this.#presented = false;
    this.#queue = Promise.resolve();
    peer.ontrack = (event) => {
      if (this.#peer !== peer) return;
      const element = this.#element;
      element.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      // Muted, so nothing stands in the way; a play cut short by the next stream rejects.
      element.play().catch(() => undefined);
    };
    peer.onicecandidate = (event) => {
      if (this.#peer !== peer) return;
      this.#send({
        type: "ice",
        connection,
        candidate: shareCandidate(event.candidate?.toJSON() ?? null),
      });
    };
    peer.onconnectionstatechange = () => {
      if (this.#peer !== peer) return;
      const link = LINKS[peer.connectionState];
      if (link === undefined || link === this.#link) return;
      this.#link = link;
      if (link === "disconnected" || link === "failed") this.#stale = true;
      // The same connection, back by itself: its picture is good again.
      else if (link === "connected" && this.#presented) this.#stale = false;
      // A failed connection never comes back; the frame it left stays in the element.
      if (link === "failed") this.#release();
      this.#watch();
    };
    this.#then(peer, async () => {
      await peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      await peer.setLocalDescription(await peer.createAnswer());
      const sdp = peer.localDescription?.sdp;
      if (sdp !== undefined) this.#send({ type: "answer", connection, sdp });
    });
    this.#watch();
  }

  /** Runs `step` after what the connection was already asked, unless it was replaced since. */
  #then(
    peer: LivePeer | undefined,
    step: (peer: LivePeer) => Promise<void>,
  ): void {
    if (peer === undefined) return;
    this.#queue = this.#queue
      .then(() => (this.#peer === peer ? step(peer) : undefined))
      .catch((error: unknown) => {
        if (this.#peer !== peer) return;
        console.error(`Screen Share “${this.id}” could not connect:`, error);
        this.#link = "failed";
        this.#stale = true;
        this.#release();
        this.#watch();
      });
  }

  #send(signal: ShareSignal): void {
    try {
      this.#context.signalling.signal(this.id, signal);
    } catch (error: unknown) {
      console.error(`Screen Share “${this.id}” could not signal:`, error);
    }
  }

  /** Starts or stops asking, for what the slot is in now. */
  #watch(): void {
    const { timers } = this.#context;
    timers.clear(this.#askTimer);
    this.#askTimer = undefined;
    if (this.#closed || this.#viewing === undefined) return;
    const { viewer } = settings.shares;
    if (this.#viewing.status === "refused") {
      this.#ask(viewer.retryRefusedMs, viewer.retryRefusedMs);
      return;
    }
    if (this.#viewing.status === "idle") return;
    if (this.#link === "connecting" || this.#link === "connected") return;
    const first =
      this.#link === "failed"
        ? 0
        : this.#link === "disconnected"
          ? viewer.askAfterDisconnectedMs
          : viewer.askEveryMs;
    this.#ask(first, viewer.askEveryMs);
  }

  #ask(after: number, every: number): void {
    const { timers, signalling } = this.#context;
    this.#askTimer = timers.set(() => {
      signalling.requestOffer(this.id);
      this.#ask(every, every);
    }, after);
  }

  /** Closes the connection in hand, keeping where it stood. */
  #release(): void {
    const peer = this.#peer;
    this.#peer = undefined;
    this.#connection = undefined;
    if (peer === undefined) return;
    peer.ontrack = null;
    peer.onicecandidate = null;
    peer.onconnectionstatechange = null;
    peer.close();
  }

  #drop(): void {
    this.#release();
    this.#link = "none";
  }

  #empty(): void {
    this.#picture = false;
    this.#stale = false;
    if (this.#element.srcObject !== null) this.#element.srcObject = null;
  }
}
