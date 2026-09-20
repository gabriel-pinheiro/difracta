import { emptyDocument, settings, type CommandRegistry } from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";
import path from "node:path";

import {
  DOCUMENT_FILE_EXTENSION,
  ensureExtension,
  modifiedAt,
  newerAutosave,
  parseDocumentFile,
  readDocumentFile,
  removeAutosaves,
  serializeDocument,
  writeFileAtomically,
} from "./document-file.ts";
import type { Autosave } from "./autosave.ts";
import { DocumentSession } from "./document-session.ts";
import { followWithAutosave } from "./session-autosave.ts";

export interface DocumentStoreOptions {
  readonly registry: CommandRegistry;
  /** Overrides `settings.autosave.delayMs`. */
  readonly autosaveIntervalMs?: number;
  /** Overrides `settings.autosave.maxWaitMs`. */
  readonly autosaveMaxWaitMs?: number;
  readonly log?: (message: string) => void;
}

export type StoreResult<TResult> =
  | { readonly ok: true; readonly result: TResult }
  | { readonly ok: false; readonly error: string };

export const UNSAVED_CHANGES =
  "The open Installation has unsaved changes; save first or discard them.";

/**
 * The one Document this runtime has open, or none. Owns new/open/save/
 * revert/replace/close and the autosave sidecar while the document is dirty. Files
 * are named by absolute path; who may name one is the live server's call.
 *
 * New and open replace the current document. They refuse while it has
 * unsaved changes unless told to discard, in which case its autosaves go
 * too, so a discarded state does not resurface as a recovery. A new
 * document starts clean: it is dirty once something changes it.
 *
 * Opening a file whose newest autosave is younger than the file loads the
 * autosave: the document starts dirty and `recovered`, so nothing is lost by
 * a crash and nothing is written until someone saves. `revert` reloads the
 * file as saved and drops the autosaves.
 *
 * The sidecar trails the document by at most the autosave delay: every
 * change to the saved part restarts the delay, and a run of changes longer
 * than the max wait writes anyway, so an hour of OSC input still leaves a
 * fresh sidecar behind. `flush` writes whatever the newest sidecar lacks.
 */
export class DocumentStore {
  #session: DocumentSession | undefined;
  #unsubscribeSession: (() => void) | undefined;
  readonly #options: DocumentStoreOptions;
  readonly #listeners = new Set<() => void>();
  /** The open session's sidecar clock. */
  #autosave: Autosave | undefined;

  constructor(options: DocumentStoreOptions) {
    this.#options = options;
  }

  current(): DocumentSummary | null {
    return this.#session?.summary() ?? null;
  }

  /** The open session when its id matches, the way requests address it. */
  session(documentId: string): DocumentSession | undefined {
    return this.#session?.id === documentId ? this.#session : undefined;
  }

  currentSession(): DocumentSession | undefined {
    return this.#session;
  }

  /** Fires whenever the document or its summary changes. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The `.difracta` file a request names; clients send absolute paths. */
  resolvePath(candidate: string): StoreResult<string> {
    if (!path.isAbsolute(candidate))
      return {
        ok: false,
        error: `“${candidate}” is not an absolute path; the runtime has no folder to resolve it in.`,
      };
    return { ok: true, result: ensureExtension(path.normalize(candidate)) };
  }

  async create(
    name: string,
    discard = false,
  ): Promise<StoreResult<DocumentSummary>> {
    if (this.#session?.dirty === true && !discard)
      return { ok: false, error: UNSAVED_CHANGES };
    const session = new DocumentSession(
      emptyDocument(name),
      this.#options.registry,
    );
    await this.#replace(session);
    return { ok: true, result: session.summary() };
  }

  /**
   * Opens the file, first writing a new Installation named after it when it
   * does not exist, parent folders included. A missing file that left an
   * autosave behind is recovered from it instead.
   */
  async openOrCreate(candidate: string): Promise<StoreResult<DocumentSummary>> {
    const resolved = this.resolvePath(candidate);
    if (!resolved.ok) return resolved;
    const filePath = resolved.result;
    const missing =
      (await modifiedAt(filePath)) === undefined &&
      (await newerAutosave(filePath)) === undefined;
    if (missing) {
      const name = path.basename(filePath, DOCUMENT_FILE_EXTENSION);
      try {
        await writeFileAtomically(
          filePath,
          serializeDocument(emptyDocument(name)),
        );
      } catch (error) {
        return {
          ok: false,
          error: `Cannot create ${filePath}: ${(error as Error).message}`,
        };
      }
    }
    return this.open(filePath);
  }

  async open(
    candidate: string,
    discard = false,
  ): Promise<StoreResult<DocumentSummary>> {
    const resolved = this.resolvePath(candidate);
    if (!resolved.ok) return resolved;
    const filePath = resolved.result;
    if (this.#session?.path === filePath)
      return { ok: true, result: this.#session.summary() };
    if (this.#session?.dirty === true && !discard)
      return { ok: false, error: UNSAVED_CHANGES };

    const sidecar = await newerAutosave(filePath);
    const loaded = await readDocumentFile(sidecar ?? filePath);
    if (!loaded.ok) return loaded;
    const session = new DocumentSession(
      loaded.document,
      this.#options.registry,
      {
        path: filePath,
        recovered: sidecar !== undefined,
      },
    );
    await this.#replace(session);
    return { ok: true, result: session.summary() };
  }

  /**
   * Reloads the file as last saved over the open document and drops
   * autosaves. A file holding another Installation, as after `replaceContent`,
   * takes the session's place the way open does.
   */
  async revert(documentId: string): Promise<StoreResult<DocumentSummary>> {
    const session = this.session(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    if (session.path === null)
      return {
        ok: false,
        error: "This Installation has no file to revert to.",
      };
    const loaded = await readDocumentFile(session.path);
    if (!loaded.ok) return loaded;
    await this.#settleAutosave();
    await removeAutosaves(session.path);
    if (loaded.document.installation.id !== session.id) {
      const reopened = new DocumentSession(
        loaded.document,
        this.#options.registry,
        { path: session.path },
      );
      await this.#replace(reopened);
      return { ok: true, result: reopened.summary() };
    }
    session.replaceDocument(loaded.document, "runtime");
    return { ok: true, result: session.summary() };
  }

  /**
   * Replaces the open document's content with the text of a `.difracta` file
   * sent by a client, keeping the path. The document is dirty and nothing is
   * written until someone saves, so `revert` brings the saved show back. The
   * same Installation is replaced in place, in one delta; another one keeps
   * its own id and takes the session's place the way open does, so clients
   * resubscribe. With nothing open it becomes a new, unsaved document.
   */
  async replaceContent(
    text: string,
    discard = false,
  ): Promise<StoreResult<DocumentSummary>> {
    const current = this.#session;
    if (current?.dirty === true && !discard)
      return { ok: false, error: UNSAVED_CHANGES };
    const parsed = parseDocumentFile(text);
    if (!parsed.ok) return parsed;
    if (current?.id !== parsed.document.installation.id) {
      const session = new DocumentSession(
        parsed.document,
        this.#options.registry,
        { path: current?.path ?? null, dirty: true },
      );
      await this.#replace(session);
      return { ok: true, result: session.summary() };
    }
    // The discarded state must not come back as a recovery.
    await this.#settleAutosave();
    if (current.path !== null) await removeAutosaves(current.path);
    current.replaceDocument(parsed.document, "runtime", { dirty: true });
    return { ok: true, result: current.summary() };
  }

  async save(
    documentId: string,
    candidate?: string,
  ): Promise<StoreResult<DocumentSummary>> {
    const session = this.session(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    const resolved =
      candidate === undefined ? undefined : this.resolvePath(candidate);
    if (resolved?.ok === false) return resolved;
    const filePath = resolved === undefined ? session.path : resolved.result;
    if (filePath === null)
      return {
        ok: false,
        error: "This Installation has no file yet; supply a path.",
      };
    await this.#settleAutosave();
    try {
      await writeFileAtomically(filePath, serializeDocument(session.document));
      await removeAutosaves(filePath);
    } catch (error) {
      return {
        ok: false,
        error: `Cannot write ${filePath}: ${(error as Error).message}`,
      };
    }
    if (session.path !== filePath) session.bindPath(filePath);
    session.markSaved();
    return { ok: true, result: session.summary() };
  }

  async close(
    documentId: string,
    discard = false,
  ): Promise<StoreResult<{ readonly closed: true }>> {
    const session = this.session(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    if (session.dirty && !discard) return { ok: false, error: UNSAVED_CHANGES };
    await this.#replace(undefined);
    return { ok: true, result: { closed: true } };
  }

  /** Writes the sidecar if the document changed since the newest one; call before process exit. */
  async flush(): Promise<void> {
    await this.#autosave?.flush();
  }

  /** Drops the pending autosave and waits for one in flight, before the file changes under it. */
  async #settleAutosave(): Promise<void> {
    this.#autosave?.cancel();
    await this.#autosave?.settle();
  }

  /** Swaps the open document; a discarded dirty document loses its autosaves. */
  async #replace(next: DocumentSession | undefined): Promise<void> {
    const previous = this.#session;
    await this.#settleAutosave();
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = undefined;
    if (previous?.dirty === true && previous.path !== null)
      await removeAutosaves(previous.path);

    this.#session = next;
    this.#autosave = undefined;
    if (next !== undefined) {
      const { autosave, stop } = followWithAutosave(next, {
        delayMs: this.#options.autosaveIntervalMs ?? settings.autosave.delayMs,
        maxWaitMs:
          this.#options.autosaveMaxWaitMs ?? settings.autosave.maxWaitMs,
        log: this.#options.log,
      });
      this.#autosave = autosave;
      const unsubscribeMeta = next.onMeta(() => this.#emit());
      this.#unsubscribeSession = () => {
        unsubscribeMeta();
        stop();
      };
    }
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
