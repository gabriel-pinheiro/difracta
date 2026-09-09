import {
  applyPatches,
  executeCommand,
  History,
  tableEntries,
  type CommandRegistry,
  type Document,
  type Patch,
} from "@difracta/core";
import {
  HISTORY_COMMANDS,
  HistoryCommandPayloadSchema,
  type DocumentSummary,
} from "@difracta/protocol";

export interface DocumentDelta {
  readonly documentId: string;
  readonly fromRevision: number;
  readonly revision: number;
  readonly patches: readonly Patch[];
  readonly originSessionId: string | undefined;
}

export type SessionCommandResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly changed: boolean;
      readonly label?: string;
    }
  | { readonly ok: false; readonly error: string };

/**
 * One open Document in the runtime: the authoritative state, its revision,
 * undo history, dirty flag and file binding. Every change goes through
 * `execute`, which emits one delta per accepted command.
 */
export class DocumentSession {
  readonly id: string;
  #document: Document;
  #revision = 0;
  #dirty: boolean;
  #recovered: boolean;
  #path: string | null;
  #history = new History();
  readonly #registry: CommandRegistry;
  readonly #listeners = new Set<(delta: DocumentDelta) => void>();
  readonly #metaListeners = new Set<() => void>();

  constructor(
    document: Document,
    registry: CommandRegistry,
    options: {
      readonly path?: string | null;
      readonly dirty?: boolean;
      /** Loaded from an autosave rather than the file; cleared by save or revert. */
      readonly recovered?: boolean;
    } = {},
  ) {
    this.id = document.installation.id;
    this.#document = document;
    this.#registry = registry;
    this.#path = options.path ?? null;
    this.#recovered = options.recovered ?? false;
    this.#dirty = options.dirty ?? this.#recovered;
  }

  get document(): Document {
    return this.#document;
  }

  get revision(): number {
    return this.#revision;
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  get recovered(): boolean {
    return this.#recovered;
  }

  get path(): string | null {
    return this.#path;
  }

  bindPath(path: string): void {
    this.#path = path;
    this.#notifyMeta();
  }

  markSaved(): void {
    this.#dirty = false;
    this.#recovered = false;
    this.#notifyMeta();
  }

  /**
   * Replaces the whole content in place, as one delta, keeping the id and the
   * subscribers. Used to revert to the file as saved. History is cleared and
   * the document is clean afterwards.
   */
  replaceDocument(document: Document, sessionId: string): void {
    const patches: Patch[] = [
      { op: "set", path: ["installation"], value: document.installation },
      { op: "set", path: ["outputs"], value: document.outputs },
    ];
    this.#history = new History();
    this.#commit(
      { ...document, operational: this.#document.operational },
      patches,
      sessionId,
    );
    this.#dirty = false;
    this.#recovered = false;
    this.#notifyMeta();
  }

  summary(): DocumentSummary {
    return {
      id: this.id,
      name: this.#document.installation.name,
      path: this.#path,
      dirty: this.#dirty,
      recovered: this.#recovered,
      revision: this.#revision,
      outputs: tableEntries(this.#document.outputs).map(({ id, name }) => ({
        id,
        name,
      })),
    };
  }

  onDelta(listener: (delta: DocumentDelta) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Fires when name, path or dirty state changes. */
  onMeta(listener: () => void): () => void {
    this.#metaListeners.add(listener);
    return () => this.#metaListeners.delete(listener);
  }

  execute(
    name: string,
    payload: unknown,
    sessionId: string,
  ): SessionCommandResult {
    if (name === HISTORY_COMMANDS.undo || name === HISTORY_COMMANDS.redo) {
      return this.#executeHistory(name, payload, sessionId);
    }
    const result = executeCommand(
      this.#registry,
      this.#document,
      name,
      payload,
    );
    if (!result.ok) return result;
    if (result.patches.length === 0)
      return { ok: true, revision: this.#revision, changed: false };

    this.#commit(result.document, result.patches, sessionId);
    if (result.definition.kind === "authoring") {
      this.#history.push({
        sessionId,
        label: result.label,
        forward: result.patches,
        inverse: result.inverse,
        coalesceKey: result.coalesceKey,
      });
    }
    // Dirty means the saved part differs from the file, whichever channel
    // changed it: a played Scene or an OSC opacity counts, Blackout does not.
    if (result.patches.some((patch) => patch.path[0] !== "operational"))
      this.#markDirty();
    return {
      ok: true,
      revision: this.#revision,
      changed: true,
      label: result.label,
    };
  }

  #executeHistory(
    name: string,
    payload: unknown,
    sessionId: string,
  ): SessionCommandResult {
    const parsed = HistoryCommandPayloadSchema.safeParse(payload ?? {});
    if (!parsed.success)
      return { ok: false, error: "Invalid history payload." };
    const global = parsed.data.global ?? false;
    const step =
      name === HISTORY_COMMANDS.undo
        ? this.#history.undo(sessionId, global)
        : this.#history.redo(sessionId, global);
    if (!step.ok) return step;
    this.#commit(
      applyPatches(this.#document, step.patches),
      step.patches,
      sessionId,
    );
    this.#markDirty();
    return {
      ok: true,
      revision: this.#revision,
      changed: true,
      label: step.entry.label,
    };
  }

  #commit(
    document: Document,
    patches: readonly Patch[],
    sessionId: string,
  ): void {
    const fromRevision = this.#revision;
    const nameBefore = this.#document.installation.name;
    const outputsBefore = this.#document.outputs;
    this.#document = document;
    this.#revision += 1;
    const delta: DocumentDelta = {
      documentId: this.id,
      fromRevision,
      revision: this.#revision,
      patches,
      originSessionId: sessionId,
    };
    for (const listener of this.#listeners) listener(delta);
    if (
      nameBefore !== document.installation.name ||
      outputsBefore !== document.outputs
    ) {
      this.#notifyMeta();
    }
  }

  #markDirty(): void {
    if (this.#dirty) return;
    this.#dirty = true;
    this.#notifyMeta();
  }

  #notifyMeta(): void {
    for (const listener of this.#metaListeners) listener();
  }
}
