import { settings } from "@difracta/core";
import type {
  DisplayAction,
  DisplayActionResult,
  DisplayHostLive,
  DisplayHostReport,
  DisplayOutcome,
  ServerMessage,
} from "@difracta/protocol";

import type { DocumentStore } from "../documents/document-store.ts";
import type { ClientSession, ReplyOutcome } from "./client-session.ts";
import { findDisplay, type DisplayHosts } from "./display-hosts.ts";
import type { RequestHandlers } from "./runtime-requests.ts";

export interface DisplayRequestsOptions {
  readonly hosts: DisplayHosts;
  readonly store: DocumentStore;
  /** Sends to one connection; false when it is gone. */
  readonly send: (sessionId: string, message: ServerMessage) => boolean;
  readonly timeoutMs?: number;
}

interface Waiting {
  readonly sessionId: string;
  readonly settle: (outcome: DisplayOutcome) => void;
}

/**
 * What the live server does for Display Hosts. A `display-host` message makes
 * its connection a host, updates it, or withdraws it (`display-hosts.ts`
 * keeps them). For `displays.show` and `displays.hide` the runtime checks
 * what it knows (the host is connected, the Display is one of its, the Output
 * is in the open Installation), passes the action to the host's connection
 * as a `display-request`, and answers the requester with what the host
 * replied. A host that says nothing within
 * `settings.displays.requestTimeoutMs`, or goes away first, fails the request.
 */
export class DisplayRequests {
  readonly #options: DisplayRequestsOptions;
  readonly #waiting = new Map<string, Waiting>();
  #counter = 0;

  constructor(options: DisplayRequestsOptions) {
    this.#options = options;
  }

  handlers(): RequestHandlers<
    "displays.list" | "displays.show" | "displays.hide"
  > {
    return {
      "displays.list": () => ({ ok: true, result: this.#options.hosts.list() }),
      "displays.show": ({ host, display, output }) => {
        const document = this.#options.store.currentSession()?.document;
        if (document === undefined)
          return { ok: false, error: "No Installation is open." };
        if (document.outputs[output] === undefined)
          return {
            ok: false,
            error: `Output “${output}” is not in the open Installation.`,
          };
        return this.#route(host, display, (id) => ({
          action: "show",
          display: id,
          output,
        }));
      },
      "displays.hide": ({ host, display }) =>
        this.#route(host, display, (id) => ({ action: "hide", display: id })),
    };
  }

  /** A host's `display-reply`; one from another connection than the asked one is ignored. */
  settle(sessionId: string, requestId: string, outcome: DisplayOutcome): void {
    const waiting = this.#waiting.get(requestId);
    if (waiting?.sessionId === sessionId) waiting.settle(outcome);
  }

  /** Only Desktop offers Displays: it is the client that can open a window on one. */
  offer(session: ClientSession, report: DisplayHostReport | null): void {
    if (session.kind !== "desktop") {
      session.send({
        type: "error",
        message: `Only a connection of kind “desktop” can be a Display Host; this one is “${session.kind ?? "?"}”.`,
      });
      return;
    }
    if (report === null) this.withdraw(session.id);
    else this.#options.hosts.report(session.id, report);
  }

  /** The connection stops being a Display Host: whoever waits for its answer hears so. */
  withdraw(sessionId: string): void {
    const host = this.#options.hosts.ofSession(sessionId);
    if (host === undefined) return;
    this.#options.hosts.withdraw(sessionId);
    for (const waiting of [...this.#waiting.values()]) {
      if (waiting.sessionId === sessionId)
        waiting.settle({
          ok: false,
          error: `Display Host “${host.id}” disconnected before answering.`,
        });
    }
  }

  close(): void {
    for (const waiting of [...this.#waiting.values()])
      waiting.settle({ ok: false, error: "The runtime is closing." });
  }

  async #route(
    hostReference: string,
    displayReference: string,
    action: (displayId: string) => DisplayAction,
  ): Promise<ReplyOutcome> {
    const host = this.#options.hosts.find(hostReference);
    if (!host.ok) return host;
    const display = findDisplay(host.value, displayReference);
    if (!display.ok) return display;
    const request = action(display.value.id);
    const outcome = await this.#ask(host.value, request);
    if (!outcome.ok) return outcome;
    const result: DisplayActionResult = {
      host: host.value.id,
      display: display.value.id,
      ...(request.action === "show" ? { output: request.output } : {}),
    };
    return { ok: true, result };
  }

  #ask(host: DisplayHostLive, request: DisplayAction): Promise<DisplayOutcome> {
    this.#counter += 1;
    const requestId = `display${String(this.#counter)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(
        () =>
          settle({
            ok: false,
            error: `Display Host “${host.id}” did not answer.`,
          }),
        this.#options.timeoutMs ?? settings.displays.requestTimeoutMs,
      );
      const settle = (outcome: DisplayOutcome): void => {
        clearTimeout(timer);
        this.#waiting.delete(requestId);
        resolve(outcome);
      };
      this.#waiting.set(requestId, { sessionId: host.sessionId, settle });
      const sent = this.#options.send(host.sessionId, {
        type: "display-request",
        requestId,
        request,
      });
      if (!sent)
        settle({
          ok: false,
          error: `Display Host “${host.id}” is not reachable.`,
        });
    });
  }
}
