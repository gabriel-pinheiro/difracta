import type { Patch } from "@difracta/core";
import type { ServerMessage } from "@difracta/protocol";

import type {
  DocumentDelta,
  DocumentEvent,
} from "../documents/document-session.ts";
import type { ClientSession } from "./client-session.ts";

/**
 * Every open connection, and who among them hears what: deltas and events go
 * to the subscribers of their document, live patches only to those that
 * subscribed with `live`, the document summary to everyone past `hello`.
 */
export class ClientSessions {
  readonly #sessions = new Set<ClientSession>();

  add(session: ClientSession): void {
    this.#sessions.add(session);
  }

  delete(session: ClientSession): void {
    this.#sessions.delete(session);
  }

  /** The sessions subscribed to `documentId`, with whether each asked for live state. */
  *subscribedTo(
    documentId: string,
  ): Generator<{ session: ClientSession; live: boolean }> {
    for (const session of this.#sessions) {
      const subscription = session.subscriptions.get(documentId);
      if (subscription !== undefined)
        yield { session, live: subscription.live };
    }
  }

  fanOutDelta(delta: DocumentDelta): void {
    for (const { session } of this.subscribedTo(delta.documentId))
      session.queueDelta(delta);
  }

  fanOutEvent(event: DocumentEvent): void {
    for (const { session } of this.subscribedTo(event.documentId))
      session.queueEvent(event);
  }

  /** `documentId` is the open document's, under which live state is subscribed; none, no listeners. */
  fanOutLive(documentId: string | undefined, patches: readonly Patch[]): void {
    if (documentId === undefined) return;
    for (const { session, live } of this.subscribedTo(documentId))
      if (live) session.queueLive(patches);
  }

  broadcast(message: ServerMessage): void {
    for (const session of this.#sessions) {
      if (session.identified) session.send(message);
    }
  }

  /** False when no such connection is open. */
  sendTo(sessionId: string, message: ServerMessage): boolean {
    for (const session of this.#sessions) {
      if (session.id !== sessionId) continue;
      session.send(message);
      return true;
    }
    return false;
  }

  disconnectAll(): void {
    for (const session of this.#sessions) session.disconnect();
  }
}
