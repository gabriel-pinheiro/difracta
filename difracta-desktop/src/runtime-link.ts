import { DifractaClient } from "@difracta/client";
import { settings } from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";

/**
 * Main's own connection to the runtime it started, as one more
 * `@difracta/client` next to Studio and the CLI. Through it main knows which
 * file is open and whether it has unsaved changes (the document summary every
 * client receives), and sends the few requests it makes itself: a first
 * Installation at start-up, Save and Don't Save when the window closes. It
 * connects over loopback, so the free runtime lets it.
 */
export class RuntimeLink {
  readonly #client: DifractaClient;

  constructor(port: number) {
    this.#client = new DifractaClient({
      url: `ws://127.0.0.1:${String(port)}${settings.runtime.livePath}`,
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

  close(): void {
    this.#client.close();
  }
}
