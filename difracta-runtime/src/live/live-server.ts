import { generateId } from "@difracta/core";
import {
  ClientMessageSchema,
  PROTOCOL_VERSION,
  RuntimeRequestSchemas,
  type ClientMessage,
  type ServerMessage,
} from "@difracta/protocol";
import type { RawData, WebSocket } from "ws";

import type { DocumentDelta } from "../documents/document-session.ts";
import type { DocumentStore } from "../documents/document-store.ts";

function decodeRawData(data: RawData): string {
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return data.toString("utf8");
}

interface ClientSession {
  readonly id: string;
  readonly socket: WebSocket;
  identified: boolean;
  /** Owner of undo entries; the session id unless hello supplied an actor. */
  actor: string;
  readonly subscriptions: Set<string>;
  pendingDeltas: DocumentDelta[];
  flushScheduled: boolean;
}

type ReplyOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: string };

export interface LiveServerOptions {
  readonly store: DocumentStore;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly log: (message: string) => void;
}

/**
 * The websocket hub. Each client subscribes to documents and receives one
 * snapshot then batched deltas: deltas produced within one event-loop turn
 * are merged into a single message per document, so a Macro that changes
 * twelve values costs one packet.
 */
export class LiveServer {
  readonly #sessions = new Set<ClientSession>();
  readonly #options: LiveServerOptions;
  readonly #unsubscribeStore: () => void;
  readonly #deltaUnsubscribers = new Map<string, () => void>();

  constructor(options: LiveServerOptions) {
    this.#options = options;
    this.#unsubscribeStore = options.store.onChange(() => {
      this.#attachSessions();
      this.#broadcast({ type: "documents", items: [...options.store.list()] });
    });
    this.#attachSessions();
  }

  close(): void {
    this.#unsubscribeStore();
    for (const unsubscribe of this.#deltaUnsubscribers.values()) unsubscribe();
    for (const session of this.#sessions) session.socket.close();
  }

  accept(socket: WebSocket): void {
    const session: ClientSession = {
      id: generateId("session"),
      socket,
      identified: false,
      actor: "",
      subscriptions: new Set(),
      pendingDeltas: [],
      flushScheduled: false,
    };
    this.#sessions.add(session);
    socket.on("message", (raw) => {
      this.#receive(session, decodeRawData(raw));
    });
    socket.on("close", () => {
      this.#sessions.delete(session);
    });
  }

  #attachSessions(): void {
    for (const documentSession of this.#options.store.sessions()) {
      if (this.#deltaUnsubscribers.has(documentSession.id)) continue;
      this.#deltaUnsubscribers.set(
        documentSession.id,
        documentSession.onDelta((delta) => this.#fanOut(delta)),
      );
    }
    for (const [documentId, unsubscribe] of this.#deltaUnsubscribers) {
      if (this.#options.store.session(documentId) === undefined) {
        unsubscribe();
        this.#deltaUnsubscribers.delete(documentId);
      }
    }
  }

  #fanOut(delta: DocumentDelta): void {
    for (const session of this.#sessions) {
      if (!session.subscriptions.has(delta.documentId)) continue;
      session.pendingDeltas.push(delta);
      if (session.flushScheduled) continue;
      session.flushScheduled = true;
      setImmediate(() => this.#flush(session));
    }
  }

  #flush(session: ClientSession): void {
    session.flushScheduled = false;
    const byDocument = new Map<string, DocumentDelta[]>();
    for (const delta of session.pendingDeltas) {
      const list = byDocument.get(delta.documentId) ?? [];
      list.push(delta);
      byDocument.set(delta.documentId, list);
    }
    session.pendingDeltas = [];
    for (const [documentId, deltas] of byDocument) {
      const first = deltas[0];
      const last = deltas.at(-1);
      if (first === undefined || last === undefined) continue;
      this.#send(session, {
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
  }

  #receive(session: ClientSession, raw: string): void {
    let message: ClientMessage;
    try {
      message = ClientMessageSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.#send(session, {
        type: "error",
        message: `Unreadable message: ${String(error)}`,
      });
      return;
    }
    if (message.type === "hello") {
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        this.#send(session, {
          type: "error",
          message: `Protocol ${message.protocolVersion} is not supported; runtime speaks ${PROTOCOL_VERSION}.`,
        });
        session.socket.close();
        return;
      }
      session.identified = true;
      session.actor = message.client.actor ?? session.id;
      this.#send(session, {
        type: "welcome",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: session.id,
        runtime: {
          name: this.#options.runtimeName,
          version: this.#options.runtimeVersion,
        },
      });
      this.#send(session, {
        type: "documents",
        items: [...this.#options.store.list()],
      });
      return;
    }
    if (!session.identified) {
      this.#send(session, { type: "error", message: "Send hello first." });
      return;
    }
    switch (message.type) {
      case "subscribe":
        this.#subscribe(session, message.documentId);
        break;
      case "unsubscribe":
        session.subscriptions.delete(message.documentId);
        break;
      case "command":
        this.#command(session, message);
        break;
      case "input": {
        const documentSession = this.#options.store.session(message.documentId);
        const result = documentSession?.execute(
          "address.set",
          { address: message.address, value: message.value },
          session.actor,
        );
        if (result !== undefined && !result.ok)
          this.#options.log(`input rejected: ${result.error}`);
        break;
      }
      case "request":
        void this.#request(session, message);
        break;
    }
  }

  #subscribe(session: ClientSession, documentId: string): void {
    const documentSession = this.#options.store.session(documentId);
    if (documentSession === undefined) {
      this.#send(session, {
        type: "error",
        message: `Document “${documentId}” is not open.`,
      });
      return;
    }
    session.subscriptions.add(documentId);
    session.pendingDeltas = session.pendingDeltas.filter(
      (delta) => delta.documentId !== documentId,
    );
    this.#send(session, {
      type: "snapshot",
      documentId,
      revision: documentSession.revision,
      document: documentSession.document,
    });
  }

  #command(
    session: ClientSession,
    message: ClientMessage & { type: "command" },
  ): void {
    const documentSession = this.#options.store.session(message.documentId);
    if (documentSession === undefined) {
      this.#reply(session, message.requestId, {
        ok: false,
        error: `Document “${message.documentId}” is not open.`,
      });
      return;
    }
    const result = documentSession.execute(
      message.name,
      message.payload,
      session.actor,
    );
    this.#reply(
      session,
      message.requestId,
      result.ok
        ? {
            ok: true,
            result: {
              revision: result.revision,
              changed: result.changed,
              label: result.label,
            },
          }
        : { ok: false, error: result.error },
    );
  }

  async #request(
    session: ClientSession,
    message: ClientMessage & { type: "request" },
  ): Promise<void> {
    const reply = (outcome: ReplyOutcome): void => {
      this.#reply(session, message.requestId, outcome);
    };
    const schema = (
      RuntimeRequestSchemas as Record<
        string,
        {
          safeParse(value: unknown): {
            success: boolean;
            data?: unknown;
            error?: { issues: { message: string }[] };
          };
        }
      >
    )[message.name];
    if (schema === undefined) {
      reply({ ok: false, error: `Unknown request “${message.name}”.` });
      return;
    }
    const parsed = schema.safeParse(message.payload ?? {});
    if (!parsed.success) {
      reply({
        ok: false,
        error: `Invalid payload for “${message.name}”: ${parsed.error?.issues[0]?.message ?? "invalid"}`,
      });
      return;
    }
    const store = this.#options.store;
    const payload = parsed.data as never;
    try {
      switch (message.name) {
        case "documents.list":
          reply({ ok: true, result: { items: store.list() } });
          break;
        case "documents.new":
          reply(store.create((payload as { name: string }).name));
          break;
        case "documents.open":
          reply(await store.open((payload as { path: string }).path));
          break;
        case "documents.save": {
          const { documentId, path } = payload as {
            documentId: string;
            path?: string;
          };
          reply(await store.save(documentId, path));
          break;
        }
        case "documents.revert":
          reply(
            await store.revert((payload as { documentId: string }).documentId),
          );
          break;
        case "documents.close": {
          const { documentId, discard } = payload as {
            documentId: string;
            discard?: boolean;
          };
          reply(store.close(documentId, discard ?? false));
          break;
        }
        case "files.list":
          reply({
            ok: true,
            result: {
              items: await store.listFiles(),
              projectsDir: store.projectsDir,
            },
          });
          break;
        default:
          reply({ ok: false, error: `Unhandled request “${message.name}”.` });
      }
    } catch (error) {
      reply({ ok: false, error: (error as Error).message });
    }
  }

  #reply(
    session: ClientSession,
    requestId: string,
    outcome: ReplyOutcome,
  ): void {
    this.#send(session, { type: "reply", requestId, outcome });
  }

  #broadcast(message: ServerMessage): void {
    for (const session of this.#sessions) {
      if (session.identified) this.#send(session, message);
    }
  }

  #send(session: ClientSession, message: ServerMessage): void {
    if (session.socket.readyState !== session.socket.OPEN) return;
    session.socket.send(JSON.stringify(message));
  }
}
