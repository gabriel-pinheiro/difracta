import type {
  ClientMessage,
  ServerMessage,
  ShareDeclaration,
  ShareEndReason,
} from "@difracta/protocol";

/** A Viewer joined one of this connection's shares (offer to it, anew if one was there) or left. */
export interface ShareViewerChange {
  readonly mediaId: string;
  readonly viewerId: string;
  readonly joined: boolean;
}

/** One of this connection's shares ended without it asking. */
export interface ShareEnd {
  readonly mediaId: string;
  readonly reason: ShareEndReason;
  readonly message: string;
}

export type SharerSignal = (
  mediaId: string,
  viewerId: string,
  payload: unknown,
) => void;

interface Declared {
  readonly declaration: ShareDeclaration;
  /** Reached the runtime at least once, so a later send is a resume. */
  sent: boolean;
}

/**
 * The Sharer side of a connection of kind `desktop`: the Screen Shares it
 * shares into, keyed by slot (the Media id), and their signalling. `share`
 * declares and updates, `stop` stops, `signal` sends one Viewer a payload.
 * Listeners hear Viewers join and leave, their payloads, and a share that
 * ended without this side asking (replaced, stopped by another client, its
 * slot removed, refused), which is then forgotten. After a reconnect every
 * share is declared again as a resume, which takes the slot back only while
 * nobody else shares into it. No WebRTC here: signalling and lifecycle only.
 */
export class Sharing {
  readonly #send: (message: ClientMessage) => boolean;
  readonly #shares = new Map<string, Declared>();
  readonly #viewerListeners = new Set<(change: ShareViewerChange) => void>();
  readonly #signalListeners = new Set<SharerSignal>();
  readonly #endListeners = new Set<(end: ShareEnd) => void>();

  constructor(send: (message: ClientMessage) => boolean) {
    this.#send = send;
  }

  /** The slots this connection shares into, in the order they were declared. */
  slots(): readonly string[] {
    return [...this.#shares.keys()];
  }

  /** Shares into a slot, or changes what it says about the share. */
  share(mediaId: string, declaration: ShareDeclaration): void {
    const declared = { declaration, sent: false };
    this.#shares.set(mediaId, declared);
    declared.sent = this.#send({ type: "share", mediaId, share: declaration });
  }

  /** Stops sharing into a slot. */
  stop(mediaId: string): void {
    if (!this.#shares.delete(mediaId)) return;
    this.#send({ type: "share", mediaId, share: null });
  }

  /** A payload for one Viewer of a slot; false when not connected. */
  signal(mediaId: string, viewerId: string, payload: unknown): boolean {
    return this.#send({ type: "share-signal", mediaId, viewerId, payload });
  }

  onViewer(listener: (change: ShareViewerChange) => void): () => void {
    this.#viewerListeners.add(listener);
    return () => this.#viewerListeners.delete(listener);
  }

  onSignal(listener: SharerSignal): () => void {
    this.#signalListeners.add(listener);
    return () => this.#signalListeners.delete(listener);
  }

  onEnded(listener: (end: ShareEnd) => void): () => void {
    this.#endListeners.add(listener);
    return () => this.#endListeners.delete(listener);
  }

  /** The client calls this after `welcome`. */
  resend(): void {
    for (const [mediaId, declared] of this.#shares) {
      const sent = this.#send({
        type: "share",
        mediaId,
        share: declared.declaration,
        ...(declared.sent ? { resume: true } : {}),
      });
      declared.sent ||= sent;
    }
  }

  /** The client calls this with what the runtime says to a Sharer. */
  receive(
    message: Extract<
      ServerMessage,
      { type: "share-viewer" | "share-ended" | "share-signal" }
    >,
  ): void {
    switch (message.type) {
      case "share-viewer": {
        if (!this.#shares.has(message.mediaId)) return;
        const { mediaId, viewerId, joined } = message;
        for (const listener of this.#viewerListeners)
          listener({ mediaId, viewerId, joined });
        break;
      }
      case "share-ended": {
        if (!this.#shares.delete(message.mediaId)) return;
        const { mediaId, reason } = message;
        for (const listener of this.#endListeners)
          listener({ mediaId, reason, message: message.message });
        break;
      }
      case "share-signal":
        if (message.viewerId === undefined) return;
        for (const listener of this.#signalListeners)
          listener(message.mediaId, message.viewerId, message.payload);
        break;
    }
  }
}
