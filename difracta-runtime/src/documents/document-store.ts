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
import { DocumentSession } from "./document-session.ts";

export interface DocumentStoreOptions {
  readonly projectsDir: string;
  readonly registry: CommandRegistry;
  readonly autosaveIntervalMs?: number;
  readonly log?: (message: string) => void;
}

export type StoreResult<TResult> =
  | { readonly ok: true; readonly result: TResult }
  | { readonly ok: false; readonly error: string };

/**
 * The set of Documents this runtime has open. Owns new/open/save/revert/close,
 * the projects directory listing, and the autosave sidecar for dirty documents.
 *
 * Opening a file whose newest autosave is younger than the file loads the
 * autosave: the document starts dirty and `recovered`, so nothing is lost by
 * a crash and nothing is written until someone saves. `revert` reloads the
 * file as saved and drops the autosaves.
 */
export class DocumentStore {
  readonly #sessions = new Map<string, DocumentSession>();
  readonly #options: DocumentStoreOptions;
  readonly #listeners = new Set<() => void>();
  readonly #autosaveTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: DocumentStoreOptions) {
    this.#options = options;
  }

  get projectsDir(): string {
    return this.#options.projectsDir;
  }

  list(): readonly DocumentSummary[] {
    return [...this.#sessions.values()].map((session) => session.summary());
  }

  session(documentId: string): DocumentSession | undefined {
    return this.#sessions.get(documentId);
  }

  sessions(): readonly DocumentSession[] {
    return [...this.#sessions.values()];
  }

  /** Fires whenever the document list or any summary changes. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  resolvePath(candidate: string): string {
    return ensureExtension(path.resolve(this.#options.projectsDir, candidate));
  }

  create(name: string): StoreResult<DocumentSummary> {
    const session = new DocumentSession(
      emptyDocument(name),
      this.#options.registry,
      { dirty: true },
    );
    this.#adopt(session);
    return { ok: true, result: session.summary() };
  }

  async open(candidate: string): Promise<StoreResult<DocumentSummary>> {
    const filePath = this.resolvePath(candidate);
    const already = this.sessions().find(
      (session) => session.path === filePath,
    );
    if (already !== undefined) return { ok: true, result: already.summary() };

    const sidecar = await newerAutosave(filePath);
    const loaded = await this.#load(sidecar ?? filePath);
    if (!loaded.ok) return loaded;
    if (this.#sessions.has(loaded.result.installation.id)) {
      return {
        ok: false,
        error: "An Installation with the same id is already open.",
      };
    }
    const session = new DocumentSession(loaded.result, this.#options.registry, {
      path: filePath,
      recovered: sidecar !== undefined,
    });
    this.#adopt(session);
    return { ok: true, result: session.summary() };
  }

  /** Reloads the file as last saved over the open document and drops autosaves. */
  async revert(documentId: string): Promise<StoreResult<DocumentSummary>> {
    const session = this.#sessions.get(documentId);
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
    this.#cancelAutosave(session.id);
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
    const session = this.#sessions.get(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    const filePath =
      candidate === undefined ? session.path : this.resolvePath(candidate);
    if (filePath === null)
      return {
        ok: false,
        error: "This Installation has no file yet; supply a path.",
      };
    if (candidate !== undefined) {
      const clash = this.sessions().find(
        (other) => other !== session && other.path === filePath,
      );
      if (clash !== undefined)
        return {
          ok: false,
          error: "Another open Installation uses that path.",
        };
    }
    try {
      await writeFileAtomically(filePath, serializeDocument(session.document));
      await removeAutosaves(filePath);
    } catch (error) {
      return {
        ok: false,
        error: `Cannot write ${filePath}: ${(error as Error).message}`,
      };
    }
    this.#cancelAutosave(session.id);
    if (session.path !== filePath) session.bindPath(filePath);
    session.markSaved();
    return { ok: true, result: session.summary() };
  }

  close(
    documentId: string,
    discard = false,
  ): StoreResult<{ readonly closed: true }> {
    const session = this.#sessions.get(documentId);
    if (session === undefined)
      return { ok: false, error: `Document “${documentId}” is not open.` };
    if (session.dirty && !discard)
      return {
        ok: false,
        error: "Unsaved changes; save first or close with discard.",
      };
    this.#cancelAutosave(session.id);
    this.#sessions.delete(documentId);
    this.#emit();
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

  /** Flushes pending autosaves; call before process exit. */
  async flush(): Promise<void> {
    await Promise.all(
      [...this.#autosaveTimers.keys()].map((id) => this.#autosave(id)),
    );
  }

  #adopt(session: DocumentSession): void {
    this.#sessions.set(session.id, session);
    session.onMeta(() => {
      if (session.dirty) this.#scheduleAutosave(session.id);
      this.#emit();
    });
    if (session.dirty) this.#scheduleAutosave(session.id);
    this.#emit();
  }

  #scheduleAutosave(documentId: string): void {
    if (this.#autosaveTimers.has(documentId)) return;
    const timer = setTimeout(() => {
      void this.#autosave(documentId);
    }, this.#options.autosaveIntervalMs ?? settings.autosave.delayMs);
    timer.unref();
    this.#autosaveTimers.set(documentId, timer);
  }

  #cancelAutosave(documentId: string): void {
    const timer = this.#autosaveTimers.get(documentId);
    if (timer !== undefined) clearTimeout(timer);
    this.#autosaveTimers.delete(documentId);
  }

  async #autosave(documentId: string): Promise<void> {
    this.#cancelAutosave(documentId);
    const session = this.#sessions.get(documentId);
    if (session === undefined || !session.dirty || session.path === null)
      return;
    try {
      const sidecar = autosavePathFor(session.path);
      await writeFileAtomically(sidecar, serializeDocument(session.document));
      await removeAutosaves(session.path, sidecar);
    } catch (error) {
      this.#options.log?.(
        `Autosave failed for ${session.path}: ${(error as Error).message}`,
      );
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
