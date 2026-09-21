import type { Catalog, Patch } from "@difracta/core";
import {
  ClientMessageSchema,
  EMPTY_LIVE_STATE,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DocumentsMode,
  type LiveState,
  type OscLive,
} from "@difracta/protocol";
import type { RawData, WebSocket } from "ws";

import type { DocumentStore } from "../documents/document-store.ts";
import { AttachedSession } from "./attached-session.ts";
import { catalogRequests } from "./catalog-requests.ts";
import { ClientSession } from "./client-session.ts";
import { ClientSessions } from "./client-sessions.ts";
import { DisplayHosts } from "./display-hosts.ts";
import { DisplayRequests } from "./display-requests.ts";
import { commandOutcome, executeCommand } from "./document-commands.ts";
import { documentRequests } from "./document-requests.ts";
import { documentsModeFor } from "./documents-mode.ts";
import { OutputPresence } from "./output-presence.ts";
import { RuntimeRequests } from "./runtime-requests.ts";

function decodeRawData(data: RawData): string {
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return data.toString("utf8");
}

export interface LiveServerOptions {
  readonly store: DocumentStore;
  /** What this runtime can render; `catalog.list` reports it to clients. */
  readonly catalog: Catalog;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  /** How the runtime was started; each connection's mode derives from it. */
  readonly documents: DocumentsMode;
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
 * snapshot then batched deltas (`client-session.ts`). Live-state patches
 * travel the same way but only to clients that subscribed with `live`, so
 * Output pages never pay for each other's telemetry. Commands run through
 * `document-commands.ts`, requests through `runtime-requests.ts`.
 */
export class LiveServer {
  readonly #sessions = new ClientSessions();
  readonly #options: LiveServerOptions;
  readonly #presence = new OutputPresence();
  readonly #hosts = new DisplayHosts();
  readonly #displayRequests: DisplayRequests;
  readonly #requests: RuntimeRequests;
  readonly #unsubscribe: readonly (() => void)[];
  readonly #attached: AttachedSession;

  constructor(options: LiveServerOptions) {
    this.#options = options;
    this.#attached = new AttachedSession({
      onEvent: (event) => this.#sessions.fanOutEvent(event),
      onDelta: (delta) => {
        this.#sessions.fanOutDelta(delta);
        this.#reconcilePresence();
      },
    });
    this.#displayRequests = new DisplayRequests({
      hosts: this.#hosts,
      store: options.store,
      send: (sessionId, message) => this.#sessions.sendTo(sessionId, message),
    });
    this.#requests = new RuntimeRequests(options.store, {
      ...documentRequests(options.store),
      ...catalogRequests(options.catalog),
      ...this.#displayRequests.handlers(),
    });
    const fanOutLive = (patches: readonly Patch[]): void =>
      this.#sessions.fanOutLive(this.#attached.id, patches);
    this.#unsubscribe = [
      options.store.onChange(() => {
        const swapped = this.#attached.follow(options.store.currentSession());
        this.#reconcilePresence();
        this.#sessions.broadcast({
          type: "document",
          summary: options.store.current(),
        });
        if (swapped) this.#resnapshot();
      }),
      this.#presence.onChange(fanOutLive),
      this.#hosts.onChange(fanOutLive),
      options.osc?.onChange((state) =>
        fanOutLive([{ op: "set", path: ["osc"], value: state }]),
      ) ?? (() => undefined),
    ];
    this.#attached.follow(options.store.currentSession());
  }

  /** The whole live state, for a snapshot. */
  #liveState(): LiveState {
    return {
      osc: this.#options.osc?.state() ?? EMPTY_LIVE_STATE.osc,
      ...this.#presence.state(),
      ...this.#hosts.state(),
    };
  }

  close(): void {
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#attached.close();
    this.#presence.close();
    this.#displayRequests.close();
    this.#hosts.close();
    this.#sessions.disconnectAll();
  }

  /** `remoteAddress` is the peer's, as the accepted socket reports it. */
  accept(socket: WebSocket, remoteAddress: string | undefined): void {
    const session = new ClientSession(
      socket,
      documentsModeFor(this.#options.documents, remoteAddress),
      () => this.#attached.id,
    );
    this.#sessions.add(session);
    socket.on("message", (raw) => {
      this.#receive(session, decodeRawData(raw));
    });
    socket.on("close", () => {
      this.#sessions.delete(session);
      this.#presence.detach(session.id);
      this.#displayRequests.withdraw(session.id);
      this.#releaseCalibration(session);
    });
  }

  /** A Studio that entered Calibration Mode and went away must not leave the Output on a pattern. */
  #releaseCalibration(session: ClientSession): void {
    const documentSession = this.#options.store.currentSession();
    if (documentSession === undefined) return;
    if (documentSession.document.operational.calibration?.owner !== session.id)
      return;
    executeCommand(
      documentSession,
      "calibration.exit",
      {},
      session.actor,
      this.#options.log,
    );
  }

  /**
   * Another session took over under the id clients are subscribed to: their
   * replicas hold the old one's state and revision, so each gets a snapshot.
   */
  #resnapshot(): void {
    const documentId = this.#attached.id;
    if (documentId === undefined) return;
    for (const { session, live } of [
      ...this.#sessions.subscribedTo(documentId),
    ])
      this.#subscribe(session, documentId, live);
  }

  #reconcilePresence(): void {
    const document = this.#options.store.currentSession()?.document;
    this.#presence.reconcile(new Set(Object.keys(document?.outputs ?? {})));
  }

  #receive(session: ClientSession, raw: string): void {
    let message: ClientMessage;
    try {
      message = ClientMessageSchema.parse(JSON.parse(raw));
    } catch (error) {
      session.send({
        type: "error",
        message: `Unreadable message: ${String(error)}`,
      });
      return;
    }
    if (message.type === "hello") {
      this.#hello(session, message);
      return;
    }
    if (!session.identified) {
      session.send({ type: "error", message: "Send hello first." });
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
      case "display-host":
        this.#displayRequests.offer(session, message.host);
        break;
      case "display-reply":
        this.#displayRequests.settle(
          session.id,
          message.requestId,
          message.outcome,
        );
        break;
      case "command":
        this.#command(session, message);
        break;
      case "input": {
        const documentSession = this.#options.store.session(message.documentId);
        if (documentSession === undefined) break;
        const result = executeCommand(
          documentSession,
          "address.set",
          { address: message.address, value: message.value },
          session.actor,
          this.#options.log,
        );
        if (!result.ok) this.#options.log(`input rejected: ${result.error}`);
        break;
      }
      case "request": {
        const { requestId } = message;
        this.#requests.answer(
          session,
          message.name,
          message.payload,
          (outcome) => session.reply(requestId, outcome),
        );
        break;
      }
    }
  }

  #hello(
    session: ClientSession,
    message: ClientMessage & { type: "hello" },
  ): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      session.send({
        type: "error",
        message: `Protocol ${message.protocolVersion} is not supported; runtime speaks ${PROTOCOL_VERSION}.`,
      });
      session.disconnect();
      return;
    }
    session.kind = message.client.kind;
    session.actor = message.client.actor ?? session.id;
    session.send({
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      sessionId: session.id,
      runtime: {
        name: this.#options.runtimeName,
        version: this.#options.runtimeVersion,
      },
      documents: session.documents,
    });
    session.send({ type: "document", summary: this.#options.store.current() });
  }

  #subscribe(session: ClientSession, documentId: string, live: boolean): void {
    const documentSession = this.#options.store.session(documentId);
    if (documentSession === undefined) {
      session.send({
        type: "error",
        message: `Document “${documentId}” is not open.`,
      });
      return;
    }
    session.subscriptions.set(documentId, { live });
    session.dropPending(documentId);
    session.send({
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
      session.reply(message.requestId, {
        ok: false,
        error: `Document “${message.documentId}” is not open.`,
      });
      return;
    }
    const result = executeCommand(
      documentSession,
      message.name,
      message.payload,
      session.actor,
      this.#options.log,
    );
    // The caller sees its own change before the reply, so code that runs on
    // the reply (select the created entity) finds it in the view.
    session.flushNow();
    session.reply(message.requestId, commandOutcome(result));
  }
}
