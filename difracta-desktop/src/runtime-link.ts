import { settings } from "@difracta/core";
import { DifractaClient, type DisplayActionHandler } from "@difracta/client";
import type { DisplayHostReport, DocumentSummary } from "@difracta/protocol";

import { countOutputSessions } from "./output-sessions.ts";
import { liveUrl } from "./runtime-address.ts";

/**
 * Main's own connection to the runtime it shows, as one more
 * `@difracta/client` next to Studio and the CLI. Through it main knows which
 * Installation is open and whether it has unsaved changes (the document
 * summary every client receives). To the runtime on this computer it also
 * sends the few requests main makes itself: a first Installation at start-up,
 * Save and Don't Save when the window closes, a file from the OS while there
 * is no Studio window to hand it to; it connects over loopback, so the free
 * runtime lets it. It is also the connection Desktop is a Display Host on
 * (`display-host.ts`), to a runtime elsewhere as much as to this one. A
 * connection that drops is retried by the client for as
 * long as the link is open, which is also how the link finds a runtime child
 * that was started again.
 */
export class RuntimeLink {
  readonly #client: DifractaClient;

  /** `origin` is the runtime's, `http://host:port`. */
  constructor(origin: string) {
    this.#client = new DifractaClient({
      url: liveUrl(origin),
      kind: "desktop",
      name: "Difracta Desktop",
      // No animation frames in a Node process; main sends no inputs anyway.
      scheduleFlush: (flush) => setTimeout(flush, 0),
    });
  }

  /** The open document's summary, or null. */
  document(): DocumentSummary | null {
    return this.#client.document.get();
  }

  /** Calls back now and whenever the summary changes, until what it returns is called; null while nothing is open or known. */
  onDocumentChange(
    listener: (summary: DocumentSummary | null) => void,
  ): () => void {
    listener(this.#client.document.get());
    return this.#client.document.subscribe(listener);
  }

  /** Calls back with the open file's path whenever it becomes another one. */
  onPathChange(listener: (path: string) => void): void {
    let known: string | null = null;
    const check = (summary: DocumentSummary | null): void => {
      const path = summary?.path ?? null;
      if (path === null || path === known) return;
      known = path;
      listener(path);
    };
    check(this.#client.document.get());
    this.#client.document.subscribe(check);
  }

  /**
   * Resolves once the runtime has said what it has open. The summary follows
   * `welcome` in a message of its own, so connected is a moment too early;
   * messages arrive in order, so the reply to any request comes after it.
   */
  async ready(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.#client.phase.get() === "connected") resolve();
      else
        this.#client.phase.subscribe((phase) => {
          if (phase === "connected") resolve();
        });
    });
    await this.#client.request("catalog.list", {});
  }

  /**
   * Desktop lands in a working Studio: a runtime that started with nothing
   * open gets a new Installation. An untouched one is not dirty, so opening
   * a file over it, or quitting, asks nothing.
   */
  async ensureDocument(): Promise<void> {
    await this.ready();
    if (this.document() === null)
      await this.#client.request("documents.new", { name: "Untitled" });
  }

  async save(documentId: string, path?: string): Promise<void> {
    await this.#client.request(
      "documents.save",
      path === undefined ? { documentId } : { documentId, path },
    );
  }

  /** Closes the document without saving; the runtime drops its autosaves too. */
  async discard(documentId: string): Promise<void> {
    await this.#client.request("documents.close", {
      documentId,
      discard: true,
    });
  }

  /** Replaces the open document with a file; refused by the runtime while there are unsaved changes. */
  async open(path: string): Promise<void> {
    await this.#client.request("documents.open", { path });
  }

  /** Whether the runtime is on the other end right now. */
  connected(): boolean {
    return this.#client.phase.get() === "connected";
  }

  /**
   * How many Output Sessions are attached to the runtime now. Live state
   * comes with a subscription to the document, whole Installation included,
   * so main subscribes for the one snapshot when it needs the number and lets
   * go again, rather than mirror every change of a show it never draws. A
   * runtime that does not answer within
   * `settings.desktop.outputSessionsTimeoutMs` counts as showing nothing.
   */
  async outputSessions(): Promise<number> {
    const documentId = this.document()?.id;
    if (documentId === undefined || !this.connected()) return 0;
    const view = this.#client.openDocument(documentId, { live: true });
    try {
      const arrived = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          resolve(false);
        }, settings.desktop.outputSessionsTimeoutMs);
        // The snapshot sets the document, then its live state; the count
        // below runs after this promise, so after both.
        const stop = view.document.subscribe(() => {
          clearTimeout(timer);
          stop();
          resolve(true);
        });
      });
      return arrived ? countOutputSessions(view.liveState.get()) : 0;
    } finally {
      this.#client.closeDocument(documentId);
    }
  }

  /** Says which Displays this computer has and what each shows; the client says it again after a reconnect. */
  offerDisplays(report: DisplayHostReport): void {
    this.#client.displayHost.offer(report);
  }

  /** Who carries out the runtime's `displays.show` and `displays.hide` here. */
  onDisplayAction(handler: DisplayActionHandler): void {
    this.#client.displayHost.onAction(handler);
  }

  withdrawDisplays(): void {
    this.#client.displayHost.withdraw();
  }

  close(): void {
    this.#client.close();
  }
}
