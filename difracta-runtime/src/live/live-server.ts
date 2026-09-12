import {
  generateId,
  type Catalog,
  type FilterDefinition,
  type Patch,
} from "@difracta/core";
import {
  ClientMessageSchema,
  EMPTY_LIVE_STATE,
  PROTOCOL_VERSION,
  RuntimeRequestSchemas,
  type ClientMessage,
  type LiveState,
  type OscLive,
  type ServerMessage,
} from "@difracta/protocol";
import type { RawData, WebSocket } from "ws";

import type {
  DocumentDelta,
  DocumentEvent,
  DocumentSession,
  SessionCommandResult,
} from "../documents/document-session.ts";
import type { DocumentStore } from "../documents/document-store.ts";
import { OutputPresence } from "./output-presence.ts";

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
  /** Subscribed document ids, with whether live state was requested. */
  readonly subscriptions: Map<string, { readonly live: boolean }>;
  pendingDeltas: DocumentDelta[];
  pendingLive: Patch[];
  pendingEvents: DocumentEvent[];
  flushScheduled: boolean;
}

type ReplyOutcome =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: string };

export interface LiveServerOptions {
  readonly store: DocumentStore;
  /** What this runtime can render; `catalog.list` reports it to clients. */
  readonly catalog: Catalog;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly log: (message: string) => void;
  /** The OSC door's state, part of the live state Studio shows. */
  readonly osc?:
    | {
        state(): OscLive;
        onChange(listener: (state: OscLive) => void): () => void;
      }
    | undefined;
}

/**
 * The websocket hub. Each client subscribes to the document and receives one
 * snapshot then batched deltas: deltas produced within one event-loop turn
 * are merged into a single message per client, so a Macro that changes
 * twelve values costs one packet. Live-state patches travel the same way but
 * only to clients that subscribed with `live`, so Output pages never pay for
 * each other's telemetry.
 */
export class LiveServer {
  readonly #sessions = new Set<ClientSession>();
  readonly #options: LiveServerOptions;
  readonly #presence = new OutputPresence();
  readonly #unsubscribeStore: () => void;
  readonly #unsubscribePresence: () => void;
  readonly #unsubscribeOsc: (() => void) | undefined;
  #unsubscribeDeltas: (() => void) | undefined;
  #unsubscribeEvents: (() => void) | undefined;
  #attachedDocumentId: string | undefined;

  constructor(options: LiveServerOptions) {
    this.#options = options;
    this.#unsubscribeStore = options.store.onChange(() => {
      this.#attachSession();
      this.#reconcilePresence();
      this.#broadcast({ type: "document", summary: options.store.current() });
    });
    this.#unsubscribePresence = this.#presence.onChange((patches) =>
      this.#fanOutLive(patches),
    );
    this.#unsubscribeOsc = options.osc?.onChange((state) =>
      this.#fanOutLive([{ op: "set", path: ["osc"], value: state }]),
    );
    this.#attachSession();
  }

  /** The whole live state, for a snapshot. */
  #liveState(): LiveState {
    return {
      osc: this.#options.osc?.state() ?? EMPTY_LIVE_STATE.osc,
      ...this.#presence.state(),
    };
  }

  close(): void {
    this.#unsubscribeStore();
    this.#unsubscribePresence();
    this.#unsubscribeOsc?.();
    this.#unsubscribeDeltas?.();
    this.#unsubscribeEvents?.();
    this.#presence.close();
    for (const session of this.#sessions) session.socket.close();
  }

  accept(socket: WebSocket): void {
    const session: ClientSession = {
      id: generateId("session"),
      socket,
      identified: false,
      actor: "",
      subscriptions: new Map(),
      pendingDeltas: [],
      pendingLive: [],
      pendingEvents: [],
      flushScheduled: false,
    };
    this.#sessions.add(session);
    socket.on("message", (raw) => {
      this.#receive(session, decodeRawData(raw));
    });
    socket.on("close", () => {
      this.#sessions.delete(session);
      this.#presence.detach(session.id);
      this.#releaseCalibration(session);
    });
  }

  /** A Studio that entered Calibration Mode and went away must not leave the Output on a pattern. */
  #releaseCalibration(session: ClientSession): void {
    const documentSession = this.#options.store.currentSession();
    if (documentSession === undefined) return;
    if (documentSession.document.operational.calibration?.owner !== session.id)
      return;
    this.#execute(documentSession, "calibration.exit", {}, session.actor);
  }

  /**
   * Runs a command on the document, turning an exception inside it into a
   * failed result: a reducer that throws must not take the socket, let alone
   * the show, down with it.
   */
  #execute(
    documentSession: DocumentSession,
    name: string,
    payload: unknown,
    actor: string,
  ): SessionCommandResult {
    try {
      return documentSession.execute(name, payload, actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#options.log(`command “${name}” threw: ${message}`);
      return {
        ok: false,
        error: `Command “${name}” failed inside the runtime: ${message}`,
      };
    }
  }

  /** Follows the store's current document; presence belongs to it. */
  #attachSession(): void {
    const documentSession = this.#options.store.currentSession();
    if (documentSession?.id === this.#attachedDocumentId) return;
    this.#unsubscribeDeltas?.();
    this.#unsubscribeEvents?.();
    this.#unsubscribeEvents = documentSession?.onEvent((event) => {
      this.#fanOutEvent(event);
    });
    this.#unsubscribeDeltas = documentSession?.onDelta((delta) => {
      this.#fanOut(delta);
      this.#reconcilePresence();
    });
    this.#attachedDocumentId = documentSession?.id;
  }

  #reconcilePresence(): void {
    const document = this.#options.store.currentSession()?.document;
    this.#presence.reconcile(new Set(Object.keys(document?.outputs ?? {})));
  }

  #fanOut(delta: DocumentDelta): void {
    for (const session of this.#sessions) {
      if (!session.subscriptions.has(delta.documentId)) continue;
      session.pendingDeltas.push(delta);
      this.#scheduleFlush(session);
    }
  }

  #fanOutEvent(event: DocumentEvent): void {
    for (const session of this.#sessions) {
      if (!session.subscriptions.has(event.documentId)) continue;
      session.pendingEvents.push(event);
      this.#scheduleFlush(session);
    }
  }

  #fanOutLive(patches: readonly Patch[]): void {
    const documentId = this.#attachedDocumentId;
    if (documentId === undefined) return;
    for (const session of this.#sessions) {
      if (session.subscriptions.get(documentId)?.live !== true) continue;
      session.pendingLive.push(...patches);
      this.#scheduleFlush(session);
    }
  }

  #scheduleFlush(session: ClientSession): void {
    if (session.flushScheduled) return;
    session.flushScheduled = true;
    setImmediate(() => this.#flush(session));
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
    const live = session.pendingLive;
    session.pendingLive = [];
    if (live.length > 0 && this.#attachedDocumentId !== undefined) {
      this.#send(session, {
        type: "live",
        documentId: this.#attachedDocumentId,
        patches: live.map((patch) => ({ ...patch, path: [...patch.path] })),
      });
    }
    // Events follow the deltas of their tick, so a Macro's Parameter
    // changes are in place before its Cue lands.
    const events = session.pendingEvents;
    session.pendingEvents = [];
    for (const event of events) {
      this.#send(session, {
        type: "event",
        documentId: event.documentId,
        address: event.address,
        ...(event.originSessionId === undefined
          ? {}
          : { originSessionId: event.originSessionId }),
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
        type: "document",
        summary: this.#options.store.current(),
      });
      return;
    }
    if (!session.identified) {
      this.#send(session, { type: "error", message: "Send hello first." });
      return;
    }
    switch (message.type) {
      case "subscribe":
        this.#subscribe(session, message.documentId, message.live ?? false);
        break;
      case "unsubscribe":
        session.subscriptions.delete(message.documentId);
        break;
      case "attach":
        this.#attach(session, message.outputId);
        break;
      case "telemetry":
        this.#presence.report(session.id, message.telemetry);
        break;
      case "command":
        this.#command(session, message);
        break;
      case "input": {
        const documentSession = this.#options.store.session(message.documentId);
        if (documentSession === undefined) break;
        const result = this.#execute(
          documentSession,
          "address.set",
          { address: message.address, value: message.value },
          session.actor,
        );
        if (!result.ok) this.#options.log(`input rejected: ${result.error}`);
        break;
      }
      case "request":
        void this.#request(session, message);
        break;
    }
  }

  #subscribe(session: ClientSession, documentId: string, live: boolean): void {
    const documentSession = this.#options.store.session(documentId);
    if (documentSession === undefined) {
      this.#send(session, {
        type: "error",
        message: `Document “${documentId}” is not open.`,
      });
      return;
    }
    session.subscriptions.set(documentId, { live });
    session.pendingDeltas = session.pendingDeltas.filter(
      (delta) => delta.documentId !== documentId,
    );
    session.pendingLive = [];
    this.#send(session, {
      type: "snapshot",
      documentId,
      revision: documentSession.revision,
      document: documentSession.document,
      ...(live ? { live: this.#liveState() } : {}),
    });
  }

  /** An Output page names its Output; unknown ids just leave it detached. */
  #attach(session: ClientSession, outputId: string | null): void {
    const document = this.#options.store.currentSession()?.document;
    if (outputId === null || document?.outputs[outputId] === undefined) {
      this.#presence.detach(session.id);
      if (outputId !== null)
        this.#options.log(`attach ignored: Output “${outputId}” is not open.`);
      return;
    }
    this.#presence.attach(session.id, outputId);
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
    const result = this.#execute(
      documentSession,
      message.name,
      message.payload,
      session.actor,
    );
    // The caller sees its own change before the reply, so code that runs on
    // the reply (select the created entity) finds it in the view.
    if (session.flushScheduled) this.#flush(session);
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
              warnings: result.warnings,
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
        case "documents.new": {
          const { name, discard } = payload as {
            name: string;
            discard?: boolean;
          };
          reply(await store.create(name, discard ?? false));
          break;
        }
        case "documents.open": {
          const { path, discard } = payload as {
            path: string;
            discard?: boolean;
          };
          reply(await store.open(path, discard ?? false));
          break;
        }
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
          reply(await store.close(documentId, discard ?? false));
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
        case "catalog.list":
          // Definitions carry their implementation: JSON drops the
          // functions, and a Filter's shader source is left out here.
          reply({
            ok: true,
            result: {
              visuals: this.#options.catalog.visuals(),
              filters: this.#options.catalog.filters().map((filter) => {
                const { fragment: _fragment, ...metadata } =
                  filter as FilterDefinition & { fragment?: unknown };
                return metadata;
              }),
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
