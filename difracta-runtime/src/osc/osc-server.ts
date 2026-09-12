import {
  resolveAddress,
  settings,
  type Color,
  type Patch,
} from "@difracta/core";
import type { OscLive } from "@difracta/protocol";
import { Bonjour } from "bonjour-service";
import { createSocket, type Socket } from "node:dgram";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { hostname } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";

import type { DocumentStore } from "../documents/document-store.ts";
import {
  decodePacket,
  encodeMessage,
  messagesOf,
  type OscArgument,
  type OscMessage,
} from "./osc-codec.ts";
import {
  buildTree,
  controllerArguments,
  hostInfo,
  leavesOf,
  nodeAt,
  OSC_ATTRIBUTES,
  targetOf,
  type OscLeaf,
  type OscTarget,
} from "./osc-tree.ts";

export interface OscServerOptions {
  readonly store: DocumentStore;
  readonly port: number;
  readonly host?: string | undefined;
  readonly name?: string | undefined;
  /** Announce on the local network with Zeroconf; off in tests. */
  readonly advertise?: boolean | undefined;
  readonly log: (message: string) => void;
}

/**
 * The show-control door: OSC over UDP in, OSCQuery over HTTP for
 * discovery, and the OSCQuery WebSocket both ways, on one port. Incoming
 * messages become the same `address.set` and `address.trigger` commands
 * Studio sends, under the actor "osc". Value changes stream back to the
 * clients that asked to LISTEN, coalesced per runtime tick like the deltas,
 * and the tree's changes are announced so a browser refreshes by itself.
 */
export class OscServer {
  readonly #options: OscServerOptions;
  readonly #rejections = new RejectionLog(settings.osc.rejectionLogIntervalMs);
  readonly #clients = new Map<WebSocket, Set<string>>();
  readonly #listeners = new Set<(state: OscLive) => void>();
  readonly #unsubscribeStore: () => void;
  #unsubscribeDeltas: (() => void) | undefined;
  #attachedDocumentId: string | undefined;
  #leaves: Map<string, OscLeaf>;
  #flushScheduled = false;
  #http: Server | undefined;
  #websockets: WebSocketServer | undefined;
  #udp: Socket | undefined;
  #bonjour: Bonjour | undefined;

  constructor(options: OscServerOptions) {
    this.#options = options;
    this.#leaves = new Map(
      leavesOf(options.store.currentSession()?.document).map((leaf) => [
        leaf.path,
        leaf,
      ]),
    );
    this.#unsubscribeStore = options.store.onChange(() => {
      this.#attach();
      this.#scheduleFlush();
    });
    this.#attach();
  }

  get port(): number {
    return this.#options.port;
  }

  state(): OscLive {
    return { port: this.#options.port, listeners: this.#clients.size };
  }

  onChange(listener: (state: OscLive) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    const host = this.#options.host ?? "0.0.0.0";
    const http = createServer((request, response) => {
      this.#serve(request, response);
    });
    this.#http = http;
    this.#websockets = new WebSocketServer({ server: http });
    this.#websockets.on("connection", (socket) => {
      this.#accept(socket);
    });
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(this.#options.port, host, () => {
        http.off("error", reject);
        resolve();
      });
    });
    const udp = createSocket("udp4");
    this.#udp = udp;
    udp.on("message", (packet) => {
      this.receive(packet);
    });
    await new Promise<void>((resolve, reject) => {
      udp.once("error", reject);
      udp.bind(this.#options.port, host, () => {
        udp.off("error", reject);
        resolve();
      });
    });
    if (this.#options.advertise !== false) this.#advertise();
  }

  async close(): Promise<void> {
    this.#unsubscribeStore();
    this.#unsubscribeDeltas?.();
    for (const socket of this.#clients.keys()) socket.close();
    this.#clients.clear();
    const bonjour = this.#bonjour;
    this.#bonjour = undefined;
    if (bonjour !== undefined)
      await new Promise<void>((resolve) => {
        bonjour.unpublishAll(() => {
          bonjour.destroy(() => resolve());
        });
      });
    this.#udp?.close();
    this.#udp = undefined;
    this.#websockets?.close();
    this.#websockets = undefined;
    const http = this.#http;
    this.#http = undefined;
    if (http?.listening === true)
      await new Promise<void>((resolve) => http.close(() => resolve()));
  }

  /** One UDP or WebSocket packet: a message, or a bundle applied in order. */
  receive(packet: Uint8Array): void {
    let messages: readonly OscMessage[];
    try {
      messages = messagesOf(decodePacket(packet));
    } catch (error) {
      this.#reject("malformed-packet", String(error));
      return;
    }
    for (const message of messages) this.#apply(message);
  }

  #apply(message: OscMessage): void {
    const target = targetOf(message.address);
    if (target === undefined) {
      this.#reject("unknown-address", message.address);
      return;
    }
    const session = this.#options.store.currentSession();
    if (session === undefined) {
      this.#reject("no-installation", message.address);
      return;
    }
    if (target.kind === "macro") {
      const result = session.execute(
        "address.trigger",
        { address: `macro/${target.id}/run` },
        "osc",
      );
      if (!result.ok)
        this.#reject("refused", `${message.address}: ${result.error}`);
      for (const warning of result.ok ? (result.warnings ?? []) : [])
        this.#reject("skipped", `${message.address}: ${warning}`);
      return;
    }
    const controller = session.document.controllers[target.id];
    if (controller === undefined || controller.kind === "group") {
      this.#reject("unknown-address", message.address);
      return;
    }
    const address = `controller/${target.id}/value`;
    const value =
      controller.kind === "number"
        ? snapped(
            numberFrom(message.args),
            resolveAddress(session.document, address)?.range,
          )
        : colorFrom(message.args);
    if (value === undefined) {
      this.#reject(
        "bad-arguments",
        `${message.address}: ${message.args.map((arg) => arg.type).join(",") || "none"}`,
      );
      return;
    }
    const result = session.execute("address.set", { address, value }, "osc");
    if (!result.ok)
      this.#reject("refused", `${message.address}: ${result.error}`);
  }

  #reject(reason: string, detail: string): void {
    const line = this.#rejections.note(reason, detail);
    if (line !== undefined) this.#options.log(`OSC ${line}`);
  }

  #attach(): void {
    const session = this.#options.store.currentSession();
    if (session?.id === this.#attachedDocumentId) return;
    this.#unsubscribeDeltas?.();
    this.#unsubscribeDeltas = session?.onDelta((delta) => {
      if (
        delta.patches.some(
          (patch) =>
            patch.path[0] === "controllers" || patch.path[0] === "macros",
        )
      )
        this.#scheduleFlush();
    });
    this.#attachedDocumentId = session?.id;
  }

  #scheduleFlush(): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    setImmediate(() => {
      this.#flushScheduled = false;
      this.#flush();
    });
  }

  /** Diffs the tree against the last one sent: added and removed paths, renamed nodes, changed values. */
  #flush(): void {
    const previous = this.#leaves;
    const next = new Map(
      leavesOf(this.#options.store.currentSession()?.document).map((leaf) => [
        leaf.path,
        leaf,
      ]),
    );
    this.#leaves = next;
    if (this.#clients.size === 0) return;
    for (const path of previous.keys())
      if (!next.has(path))
        this.#notify({ COMMAND: "PATH_REMOVED", DATA: path });
    for (const [path, leaf] of next) {
      const before = previous.get(path);
      if (before === undefined) {
        this.#notify({ COMMAND: "PATH_ADDED", DATA: path });
        continue;
      }
      if (
        before.node.DESCRIPTION !== leaf.node.DESCRIPTION ||
        before.node.TYPE !== leaf.node.TYPE
      )
        this.#notify({ COMMAND: "PATH_CHANGED", DATA: path });
      if (
        leaf.target.kind === "controller" &&
        JSON.stringify(before.node.VALUE) !== JSON.stringify(leaf.node.VALUE)
      )
        this.#push(leaf.target);
    }
  }

  #notify(command: Record<string, unknown>): void {
    const text = JSON.stringify(command);
    for (const socket of this.#clients.keys()) socket.send(text);
  }

  #push(target: OscTarget): void {
    const controller =
      this.#options.store.currentSession()?.document.controllers[target.id];
    if (controller === undefined) return;
    const path = `/${target.kind}/${target.id}`;
    const bytes = encodeMessage({
      address: path,
      args: controllerArguments(controller),
    });
    for (const [socket, listened] of this.#clients)
      if (listened.has(path)) socket.send(bytes);
  }

  #accept(socket: WebSocket): void {
    this.#clients.set(socket, new Set());
    this.#changed();
    socket.on("message", (raw, isBinary) => {
      const bytes = Array.isArray(raw)
        ? Buffer.concat(raw)
        : raw instanceof ArrayBuffer
          ? Buffer.from(raw)
          : raw;
      if (isBinary) {
        this.receive(new Uint8Array(bytes));
        return;
      }
      let command: { COMMAND?: unknown; DATA?: unknown };
      try {
        command = JSON.parse(bytes.toString()) as typeof command;
      } catch {
        this.#reject("bad-websocket-command", bytes.toString().slice(0, 80));
        return;
      }
      const listened = this.#clients.get(socket);
      if (listened === undefined || typeof command.DATA !== "string") return;
      if (command.COMMAND === "LISTEN") listened.add(command.DATA);
      else if (command.COMMAND === "IGNORE") listened.delete(command.DATA);
    });
    socket.on("close", () => {
      this.#clients.delete(socket);
      this.#changed();
    });
  }

  #changed(): void {
    const state = this.state();
    for (const listener of this.#listeners) listener(state);
  }

  /** OSCQuery over HTTP: the tree or a node, one attribute of it, or HOST_INFO. */
  #serve(request: IncomingMessage, response: ServerResponse): void {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://difracta.local");
    const attributes = [...url.searchParams.keys()];
    const json = (body: unknown): void => {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(JSON.stringify(body));
    };
    if (attributes.includes("HOST_INFO")) {
      json(
        hostInfo(this.#options.name ?? settings.osc.name, this.#options.port),
      );
      return;
    }
    if (
      attributes.length > 1 ||
      attributes.some((a) => !OSC_ATTRIBUTES.has(a))
    ) {
      response.writeHead(400).end();
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const node = nodeAt(
      buildTree(this.#options.store.currentSession()?.document, [
        ...this.#leaves.values(),
      ]),
      path,
    );
    if (node === undefined) {
      response.writeHead(404).end();
      return;
    }
    const attribute = attributes[0];
    if (attribute === undefined) {
      json(node);
      return;
    }
    if (!(attribute in node)) {
      response.writeHead(204).end();
      return;
    }
    json({
      [attribute]: (node as unknown as Record<string, unknown>)[attribute],
    });
  }

  #advertise(): void {
    const name = this.#options.name ?? settings.osc.name;
    const instance = `${name} on ${hostname().replace(/\.local$/i, "")}`;
    const bonjour = new Bonjour({}, (error: Error) => {
      this.#options.log(`Zeroconf: ${error.message}`);
    });
    this.#bonjour = bonjour;
    bonjour.publish({
      name: instance,
      type: "oscjson",
      protocol: "tcp",
      port: this.#options.port,
      disableIPv6: true,
    });
    bonjour.publish({
      name: instance,
      type: "osc",
      protocol: "udp",
      port: this.#options.port,
      disableIPv6: true,
    });
  }
}

/** float32 noise (0.9 arrives as 0.89999997…) rounded away, so files and readouts stay tidy. */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6;

/** A number in 0..1 from one numeric or boolean argument; out-of-range values are clamped. */
function numberFrom(args: readonly OscArgument[]): number | undefined {
  const [arg] = args;
  if (arg === undefined || args.length !== 1) return undefined;
  if (arg.type === "true") return 1;
  if (arg.type === "false") return 0;
  if (
    arg.type !== "int32" &&
    arg.type !== "float32" &&
    arg.type !== "double" &&
    arg.type !== "int64"
  )
    return undefined;
  if (!Number.isFinite(arg.value)) return undefined;
  return tidy(Math.min(1, Math.max(0, arg.value)));
}

/**
 * A fader sends any float; the Controller's Address accepts only its step
 * grid, so the value is snapped to the nearest step before it is written.
 */
function snapped(
  value: number | undefined,
  range: { min: number; step?: number } | undefined,
): number | undefined {
  if (value === undefined || range?.step === undefined) return value;
  return tidy(
    range.min + Math.round((value - range.min) / range.step) * range.step,
  );
}

/** A color from one RGBA argument, or three or four numbers in 0..1. */
function colorFrom(args: readonly OscArgument[]): Color | undefined {
  const [first] = args;
  if (first?.type === "color" && args.length === 1)
    return [
      first.value[0] / 255,
      first.value[1] / 255,
      first.value[2] / 255,
      first.value[3] / 255,
    ];
  if (args.length !== 3 && args.length !== 4) return undefined;
  const channels: number[] = [];
  for (const arg of args) {
    if (
      (arg.type !== "float32" &&
        arg.type !== "double" &&
        arg.type !== "int32") ||
      !Number.isFinite(arg.value)
    )
      return undefined;
    channels.push(tidy(Math.min(1, Math.max(0, arg.value))));
  }
  const [r = 0, g = 0, b = 0, a = 1] = channels;
  return [r, g, b, a];
}

/** Rejected input is logged once per reason per window, with a count of what was suppressed. */
class RejectionLog {
  readonly #entries = new Map<string, { at: number; suppressed: number }>();
  readonly #windowMs: number;

  constructor(windowMs: number) {
    this.#windowMs = windowMs;
  }

  note(reason: string, detail: string): string | undefined {
    const now = Date.now();
    const previous = this.#entries.get(reason);
    if (previous !== undefined && now - previous.at < this.#windowMs) {
      previous.suppressed += 1;
      return undefined;
    }
    const suffix =
      previous === undefined || previous.suppressed === 0
        ? ""
        : ` (+${String(previous.suppressed)} more)`;
    this.#entries.set(reason, { at: now, suppressed: 0 });
    return `${reason}: ${detail}${suffix}`;
  }
}

export type { Patch };
