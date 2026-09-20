import type {
  DocumentDelta,
  DocumentEvent,
  DocumentSession,
} from "../documents/document-session.ts";

export interface AttachedSessionHandlers {
  readonly onDelta: (delta: DocumentDelta) => void;
  readonly onEvent: (event: DocumentEvent) => void;
}

/**
 * The document session the live server listens to. Sessions are told apart by
 * identity, not by id: opening a copy of the open file (Save As keeps the
 * Installation id) puts another session under the same id, and listeners left
 * on the old one would never hear the new one's deltas.
 */
export class AttachedSession {
  readonly #handlers: AttachedSessionHandlers;
  #session: DocumentSession | undefined;
  #detach: (() => void) | undefined;

  constructor(handlers: AttachedSessionHandlers) {
    this.#handlers = handlers;
  }

  get id(): string | undefined {
    return this.#session?.id;
  }

  /**
   * Moves the listeners to the store's current session. True when another
   * session took over under the same id: subscriptions are by id, so clients
   * stay subscribed and cannot tell by themselves; each needs a new snapshot.
   */
  follow(next: DocumentSession | undefined): boolean {
    const previous = this.#session;
    if (next === previous) return false;
    this.close();
    this.#session = next;
    if (next !== undefined) {
      const offEvent = next.onEvent(this.#handlers.onEvent);
      const offDelta = next.onDelta(this.#handlers.onDelta);
      this.#detach = () => {
        offEvent();
        offDelta();
      };
    }
    return next !== undefined && next.id === previous?.id;
  }

  close(): void {
    this.#detach?.();
    this.#detach = undefined;
    this.#session = undefined;
  }
}
