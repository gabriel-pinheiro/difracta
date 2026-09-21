import { generateId, type Patch } from "@difracta/core";
import type {
  ClientKind,
  DocumentsMode,
  ServerMessage,
} from "@difracta/protocol";
import type { WebSocket } from "ws";

import type {
  DocumentDelta,
  DocumentEvent,
} from "../documents/document-session.ts";

export type ReplyOutcome = Extract<ServerMessage, { type: "reply" }>["outcome"];

/**
 * One connection as the live server keeps it: who it is, what it subscribed
 * to, and what waits to be sent. Deltas, live patches and events queued
 * within one event-loop turn leave as one message of each kind, so a Macro
 * that changes twelve values costs one packet.
 */
export class ClientSession {
  readonly id: string = generateId("session");
  /** What this connection may do with the document, told in `welcome`. */
  readonly documents: DocumentsMode;
  /** Undefined until `hello`. */
  kind: ClientKind | undefined;
  /** Owner of undo entries; the session id unless hello supplied an actor. */
  actor = "";
  /** Subscribed document ids, with whether live state was requested. */
  readonly subscriptions = new Map<string, { readonly live: boolean }>();
  readonly #socket: WebSocket;
  /** The id live patches go out under: the document the server listens to. */
  readonly #attachedId: () => string | undefined;
  #pendingDeltas: DocumentDelta[] = [];
  #pendingLive: Patch[] = [];
  #pendingEvents: DocumentEvent[] = [];
  #flushScheduled = false;

  constructor(
    socket: WebSocket,
    documents: DocumentsMode,
    attachedId: () => string | undefined,
  ) {
    this.#socket = socket;
    this.documents = documents;
    this.#attachedId = attachedId;
  }

  get identified(): boolean {
    return this.kind !== undefined;
  }

  send(message: ServerMessage): void {
    if (this.#socket.readyState !== this.#socket.OPEN) return;
    this.#socket.send(JSON.stringify(message));
  }

  reply(requestId: string, outcome: ReplyOutcome): void {
    this.send({ type: "reply", requestId, outcome });
  }

  disconnect(): void {
    this.#socket.close();
  }

  queueDelta(delta: DocumentDelta): void {
    this.#pendingDeltas.push(delta);
    this.#scheduleFlush();
  }

  queueLive(patches: readonly Patch[]): void {
    this.#pendingLive.push(...patches);
    this.#scheduleFlush();
  }

  queueEvent(event: DocumentEvent): void {
    this.#pendingEvents.push(event);
    this.#scheduleFlush();
  }

  /** A snapshot of `documentId` is about to be sent: what was queued for it is in there. */
  dropPending(documentId: string): void {
    this.#pendingDeltas = this.#pendingDeltas.filter(
      (delta) => delta.documentId !== documentId,
    );
    this.#pendingLive = [];
  }

  /** Sends what is queued now rather than at the end of the turn. */
  flushNow(): void {
    if (this.#flushScheduled) this.#flush();
  }

  #scheduleFlush(): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    setImmediate(() => this.#flush());
  }

  #flush(): void {
    this.#flushScheduled = false;
    const byDocument = new Map<string, DocumentDelta[]>();
    for (const delta of this.#pendingDeltas) {
      const list = byDocument.get(delta.documentId) ?? [];
      list.push(delta);
      byDocument.set(delta.documentId, list);
    }
    this.#pendingDeltas = [];
    for (const [documentId, deltas] of byDocument) {
      const first = deltas[0];
      const last = deltas.at(-1);
      if (first === undefined || last === undefined) continue;
      this.send({
        type: "delta",
        documentId,
        fromRevision: first.fromRevision,
        revision: last.revision,
        patches: deltas.flatMap((delta) =>
          delta.patches.map((patch) => ({ ...patch, path: [...patch.path] })),
        ),
        ...(deltas.length === 1 && first.originSessionId !== undefined
          ? { originSessionId: first.originSessionId }
          : {}),
      });
    }
    const live = this.#pendingLive;
    this.#pendingLive = [];
    const attachedId = this.#attachedId();
    if (live.length > 0 && attachedId !== undefined) {
      this.send({
        type: "live",
        documentId: attachedId,
        patches: live.map((patch) => ({ ...patch, path: [...patch.path] })),
      });
    }
    // Events follow the deltas of their tick, so a Macro's Parameter
    // changes are in place before its Cue lands.
    const events = this.#pendingEvents;
    this.#pendingEvents = [];
    for (const event of events) {
      this.send({
        type: "event",
        documentId: event.documentId,
        address: event.address,
        ...(event.originSessionId === undefined
          ? {}
          : { originSessionId: event.originSessionId }),
      });
    }
  }
}
