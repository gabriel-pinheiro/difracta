import type {
  ClientMessage,
  ServerMessage,
  ShareViewing,
} from "@difracta/protocol";

export type ViewerSignal = (mediaId: string, payload: unknown) => void;

/**
 * The Viewer side of any connection: the Screen Shares it views, keyed by
 * slot (the Media id), with where it stands with each (`idle` while
 * nobody shares, `live` or `interrupted` with the share's id, `refused`
 * with why), and their signalling. `view` joins, `requestOffer` asks the
 * Sharer for a new offer, `leave` leaves, `signal` sends the Sharer a
 * payload. After a reconnect every slot still viewed is asked for again,
 * refused ones included. No WebRTC here: signalling and lifecycle only.
 */
export class Viewing {
  readonly #send: (message: ClientMessage) => boolean;
  readonly #slots = new Map<string, ShareViewing | undefined>();
  readonly #viewingListeners = new Set<
    (mediaId: string, viewing: ShareViewing) => void
  >();
  readonly #signalListeners = new Set<ViewerSignal>();

  constructor(send: (message: ClientMessage) => boolean) {
    this.#send = send;
  }

  /** The slots this connection views. */
  slots(): readonly string[] {
    return [...this.#slots.keys()];
  }

  /** What the runtime last said about a slot; undefined before it answered or when not viewed. */
  state(mediaId: string): ShareViewing | undefined {
    return this.#slots.get(mediaId);
  }

  /** Views a slot; the runtime answers with where this connection stands. */
  view(mediaId: string): void {
    if (this.#slots.has(mediaId)) return;
    this.#slots.set(mediaId, undefined);
    this.#send({ type: "share-view", mediaId, view: true });
  }

  /**
   * Asks the slot's Sharer for a new offer, as after a connection stalled;
   * the runtime announces this Viewer to it again. Nothing while not viewing.
   */
  requestOffer(mediaId: string): boolean {
    if (!this.#slots.has(mediaId)) return false;
    return this.#send({ type: "share-view", mediaId, view: true });
  }

  leave(mediaId: string): void {
    if (!this.#slots.delete(mediaId)) return;
    this.#send({ type: "share-view", mediaId, view: false });
  }

  /** A payload for the slot's Sharer; false when not connected. */
  signal(mediaId: string, payload: unknown): boolean {
    return this.#send({ type: "share-signal", mediaId, payload });
  }

  onViewing(
    listener: (mediaId: string, viewing: ShareViewing) => void,
  ): () => void {
    this.#viewingListeners.add(listener);
    return () => this.#viewingListeners.delete(listener);
  }

  onSignal(listener: ViewerSignal): () => void {
    this.#signalListeners.add(listener);
    return () => this.#signalListeners.delete(listener);
  }

  /** The client calls this after `welcome`. */
  resend(): void {
    for (const mediaId of this.#slots.keys())
      this.#send({ type: "share-view", mediaId, view: true });
  }

  /** The client calls this with what the runtime says to a Viewer. */
  receive(
    message: Extract<ServerMessage, { type: "share-viewing" | "share-signal" }>,
  ): void {
    if (!this.#slots.has(message.mediaId)) return;
    if (message.type === "share-signal") {
      if (message.viewerId !== undefined) return;
      for (const listener of this.#signalListeners)
        listener(message.mediaId, message.payload);
      return;
    }
    this.#slots.set(message.mediaId, message.viewing);
    for (const listener of this.#viewingListeners)
      listener(message.mediaId, message.viewing);
  }
}
