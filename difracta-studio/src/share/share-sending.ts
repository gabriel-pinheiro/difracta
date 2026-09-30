import {
  codecOrder,
  parseShareSignal,
  sendEncoding,
  settings,
  shareCandidate,
  type ShareQuality,
  type ShareSignal,
} from "@difracta/core";

/** The part of `RTCPeerConnection` a Sharer uses. */
export type SharerPeer = Pick<
  RTCPeerConnection,
  | "connectionState"
  | "onconnectionstatechange"
  | "onicecandidate"
  | "addTransceiver"
  | "setLocalDescription"
  | "localDescription"
  | "setRemoteDescription"
  | "addIceCandidate"
  | "close"
>;

/** What a share's connections need from the page around them, injected so they are tested without a browser. */
export interface SendingContext {
  readonly createPeer: () => SharerPeer;
  /** The video codecs this browser can send. */
  readonly codecs: () => readonly RTCRtpCodec[];
  /** An id for a connection, new each time. */
  readonly connectionId: () => string;
  /** A payload for one Viewer. */
  readonly signal: (viewerId: string, signal: ShareSignal) => void;
  /** A Viewer came, went, connected or dropped. */
  readonly changed: () => void;
}

interface Connection {
  readonly peer: SharerPeer;
  readonly id: string;
  /** What the connection still has to do, in order. */
  queue: Promise<void>;
}

/** The captured track and its stream. */
export interface Captured {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
}

/**
 * One share's peer connections: one per Viewer the runtime announced, send
 * only, with no ICE servers, since the Viewers are on the same network.
 * Every announcement makes a connection from scratch under a new id, a
 * Viewer announced again being one that asks for a new offer, and the
 * answer and the candidates count only under the id of the connection in
 * hand. The picture is encoded once per connection, as the quality says
 * (`share-quality.ts` in core) from the first frame on; what gives way
 * under load can only be said once the answer is in.
 *
 * A connection that failed is dropped: a Viewer that is still there asks
 * for a new offer, and one that went with a runtime that was started again
 * never says it left.
 */
export class ShareSending {
  readonly #captured: Captured;
  readonly #quality: ShareQuality;
  readonly #context: SendingContext;
  readonly #connections = new Map<string, Connection>();
  #closed = false;

  constructor(
    captured: Captured,
    quality: ShareQuality,
    context: SendingContext,
  ) {
    this.#captured = captured;
    this.#quality = quality;
    this.#context = context;
  }

  /** The Viewers a connection was made for, and the ones whose picture arrives. */
  viewers(): { readonly offered: number; readonly connected: number } {
    let connected = 0;
    for (const { peer } of this.#connections.values())
      if (peer.connectionState === "connected") connected += 1;
    return { offered: this.#connections.size, connected };
  }

  /** The runtime announced a Viewer, for the first time or again: a new connection and a new offer. */
  joined(viewerId: string): void {
    if (this.#closed) return;
    this.#drop(viewerId);
    const { track, stream } = this.#captured;
    const peer = this.#context.createPeer();
    const id = this.#context.connectionId();
    const connection: Connection = { peer, id, queue: Promise.resolve() };
    this.#connections.set(viewerId, connection);
    const current = (): boolean =>
      this.#connections.get(viewerId) === connection;

    const { width = 0, height = 0 } = track.getSettings();
    const transceiver = peer.addTransceiver(track, {
      direction: "sendonly",
      streams: [stream],
      sendEncodings: [sendEncoding(this.#quality, { width, height })],
    });
    try {
      transceiver.setCodecPreferences(
        codecOrder(this.#context.codecs(), this.#quality),
      );
    } catch {
      // The browser's own order, then.
    }
    peer.onicecandidate = (event) => {
      if (!current()) return;
      this.#context.signal(viewerId, {
        type: "ice",
        connection: id,
        candidate: shareCandidate(event.candidate?.toJSON() ?? null),
      });
    };
    peer.onconnectionstatechange = () => {
      if (!current()) return;
      if (peer.connectionState === "failed") this.#drop(viewerId);
      this.#context.changed();
    };
    this.#then(viewerId, connection, async () => {
      await peer.setLocalDescription();
      const sdp = peer.localDescription?.sdp;
      if (sdp !== undefined && current())
        this.#context.signal(viewerId, { type: "offer", connection: id, sdp });
    });
    this.#context.changed();
  }

  left(viewerId: string): void {
    if (this.#drop(viewerId)) this.#context.changed();
  }

  /** A payload from a Viewer: its answer, or a candidate of its. */
  signal(viewerId: string, payload: unknown): void {
    const connection = this.#connections.get(viewerId);
    const signal = parseShareSignal(payload);
    if (connection === undefined || signal?.connection !== connection.id)
      return;
    const { peer } = connection;
    if (signal.type === "answer")
      this.#then(viewerId, connection, async () => {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.#prefer(peer);
      });
    else if (signal.type === "ice")
      this.#then(viewerId, connection, () =>
        peer.addIceCandidate(signal.candidate ?? undefined),
      );
  }

  close(): void {
    this.#closed = true;
    for (const viewerId of [...this.#connections.keys()]) this.#drop(viewerId);
  }

  /** What gives way when the computer or the network cannot keep up. */
  async #prefer(peer: SharerPeer): Promise<void> {
    const [sender] = (peer as Partial<RTCPeerConnection>).getSenders?.() ?? [];
    if (sender === undefined) return;
    const parameters = sender.getParameters();
    parameters.degradationPreference =
      settings.shares.sharer.qualities[this.#quality].degradationPreference;
    await sender.setParameters(parameters);
  }

  /** Runs `step` after what the connection was already asked, unless it was replaced since. */
  #then(
    viewerId: string,
    connection: Connection,
    step: () => Promise<void>,
  ): void {
    const current = (): boolean =>
      this.#connections.get(viewerId) === connection;
    connection.queue = connection.queue
      .then(() => (current() ? step() : undefined))
      .catch((error: unknown) => {
        if (!current()) return;
        console.error(`The connection to a Viewer could not be made:`, error);
        this.#drop(viewerId);
        this.#context.changed();
      });
  }

  #drop(viewerId: string): boolean {
    const connection = this.#connections.get(viewerId);
    if (connection === undefined) return false;
    this.#connections.delete(viewerId);
    const { peer } = connection;
    peer.onicecandidate = null;
    peer.onconnectionstatechange = null;
    peer.close();
    return true;
  }
}

/** A Sharer's peer connection in a browser: no ICE servers, the Viewers are on the same network. */
export const browserPeer = (): SharerPeer =>
  new RTCPeerConnection({ iceServers: [] });

export const browserCodecs = (): readonly RTCRtpCodec[] =>
  RTCRtpSender.getCapabilities("video")?.codecs ?? [];

export const browserConnectionId = (): string => crypto.randomUUID();
