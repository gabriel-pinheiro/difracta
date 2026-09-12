import {
  emptyDocument,
  settings,
  type CommandRegistry,
  type Document,
} from "@difracta/core";
import type { DocumentSummary, FileEntry } from "@difracta/protocol";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  autosavePathFor,
  DOCUMENT_FILE_EXTENSION,
  ensureExtension,
  isAutosavePath,
  newerAutosave,
  parseDocumentFile,
  recoveryAvailable,
  removeAutosaves,
  serializeDocument,
  writeFileAtomically,
} from "./document-file.ts";
import { Autosave } from "./autosave.ts";
import { DocumentSession } from "./document-session.ts";

export interface DocumentStoreOptions {
  readonly projectsDir: string;
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

const UNSAVED_CHANGES =
  "The open Installation has unsaved changes; save first or discard them.";

/**
 * The one Document this runtime has open, or none. Owns new/open/save/
 * revert/close, the projects directory listing, and the autosave sidecar
 * while the document is dirty.
 *
 * New and open replace the current document. They refuse while it has
 * unsaved changes unless told to discard, in which case its autosaves go
 * too, so a discarded state does not resurface as a recovery.
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

  get projectsDir(): string {
    return this.#options.projectsDir;
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

  resolvePath(candidate: string): string {
    return ensureExtension(path.resolve(this.#options.projectsDir, candidate));
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
      { dirty: true },
    );
    await this.#replace(session);
    return { ok: true, result: session.summary() };
  }

  async open(
    candidate: string,
    discard = false,
  ): Promise<StoreResult<DocumentSummary>> {
    const filePath = this.resolvePath(candidate);
    if (this.#session?.path === filePath)
      return { ok: true, result: this.#session.summary() };
    if (this.#session?.dirty === true && !discard)
      return { ok: false, error: UNSAVED_CHANGES };

    const sidecar = await newerAutosave(filePath);
    const loaded = await this.#load(sidecar ?? filePath);
    if (!loaded.ok) return loaded;
    const session = new DocumentSession(loaded.result, this.#options.registry, {
      path: filePath,
      recovered: sidecar !== undefined,
    });
    await this.#replace(session);
    return { ok: true, result: session.summary() };
  }

  /** Reloads the file as last saved over the open document and drops autosaves. */
  async revert(documentId: string): Promise<StoreResult<DocumentSummary>> {
    const session = this.session(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    if (session.path === null)
      return {
        ok: false,
        error: "This Installation has no file to revert to.",
      };
    const loaded = await this.#load(session.path);
    if (!loaded.ok) return loaded;
    if (loaded.result.installation.id !== session.id)
      return {
        ok: false,
        error: "The file on disk is a different Installation.",
      };
    await this.#settleAutosave();
    await removeAutosaves(session.path);
    session.replaceDocument(loaded.result, "runtime");
    return { ok: true, result: session.summary() };
  }

  async #load(source: string): Promise<StoreResult<Document>> {
    let text: string;
    try {
      text = await readFile(source, "utf8");
    } catch (error) {
      return {
        ok: false,
        error: `Cannot read ${source}: ${(error as Error).message}`,
      };
    }
    const parsed = parseDocumentFile(text);
    if (!parsed.ok) return { ok: false, error: `${source}: ${parsed.error}` };
    return { ok: true, result: parsed.document };
  }

  async save(
    documentId: string,
    candidate?: string,
  ): Promise<StoreResult<DocumentSummary>> {
    const session = this.session(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    const filePath =
      candidate === undefined ? session.path : this.resolvePath(candidate);
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

  async listFiles(): Promise<readonly FileEntry[]> {
    const dir = this.#options.projectsDir;
    await mkdir(dir, { recursive: true });
    const names = (await readdir(dir)).filter(
      (name) => name.endsWith(DOCUMENT_FILE_EXTENSION) && !isAutosavePath(name),
    );
    const entries = await Promise.all(
      names.map(async (name): Promise<FileEntry> => {
        const filePath = path.join(dir, name);
        const [info, recovery] = await Promise.all([
          stat(filePath),
          recoveryAvailable(filePath),
        ]);
        return {
          path: filePath,
          name: name.slice(0, -DOCUMENT_FILE_EXTENSION.length),
          modifiedAt: info.mtimeMs,
          recoveryAvailable: recovery,
        };
      }),
    );
    return entries.sort((a, b) => b.modifiedAt - a.modifiedAt);
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
      const autosave = new Autosave({
        delayMs: this.#options.autosaveIntervalMs ?? settings.autosave.delayMs,
        maxWaitMs:
          this.#options.autosaveMaxWaitMs ?? settings.autosave.maxWaitMs,
        write: () => this.#writeSidecar(next),
      });
      this.#autosave = autosave;
      const unsubscribeMeta = next.onMeta(() => this.#emit());
      const unsubscribeChange = next.onChange(() => autosave.changed());
      this.#unsubscribeSession = () => {
        unsubscribeMeta();
        unsubscribeChange();
      };
      if (next.dirty) autosave.schedule();
    }
    this.#emit();
  }

  /** Writes the session's sidecar; false when there is nothing to write or it failed. */
  async #writeSidecar(session: DocumentSession): Promise<boolean> {
    if (!session.dirty || session.path === null) return false;
    try {
      const sidecar = autosavePathFor(session.path);
      await writeFileAtomically(sidecar, serializeDocument(session.document));
      await removeAutosaves(session.path, sidecar);
      return true;
    } catch (error) {
      this.#options.log?.(
        `Autosave failed for ${session.path}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
