import {
  applyPatches,
  executeCommand,
  History,
  TABLE_SCHEMAS,
  tableEntries,
  type CommandRegistry,
  type Document,
  type MacroRun,
  type Patch,
} from "@difracta/core";
import {
  HISTORY_COMMANDS,
  HistoryCommandPayloadSchema,
  type CreatedEntity,
  type DocumentSummary,
} from "@difracta/protocol";

export interface DocumentDelta {
  readonly documentId: string;
  readonly fromRevision: number;
  readonly revision: number;
  readonly patches: readonly Patch[];
  readonly originSessionId: string | undefined;
}

/** A trigger Address fired by a command; announced, never stored. */
export interface DocumentEvent {
  readonly documentId: string;
  readonly address: string;
  readonly originSessionId: string | undefined;
}

export type SessionCommandResult =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly changed: boolean;
      readonly label?: string;
      /** What a best-effort command (a Macro run) skipped, or a removal took with it. */
      readonly warnings?: readonly string[];
      /** Entities the command added, so a caller learns the ids it generated. */
      readonly created?: readonly CreatedEntity[];
      /** After a Macro run: how many actions its Run Mode picked, and how many passed their Chance. */
      readonly run?: MacroRun;
    }
  | {
      readonly ok: false;
      readonly error: string;
      /** One line per payload problem, when the payload failed its schema. */
      readonly issues?: readonly string[];
    };

/**
 * The entities a command's patches add: a `set` of a whole entity
 * (`[table, id]`) whose id the table did not hold before. Derived from the
 * patches alone, so every command reports what it created without saying so.
 */
export function createdEntities(
  before: Document,
  patches: readonly Patch[],
): CreatedEntity[] {
  const created: CreatedEntity[] = [];
  for (const patch of patches) {
    if (patch.op !== "set" || patch.path.length !== 2) continue;
    const [table, id] = patch.path;
    if (table === undefined || id === undefined) continue;
    if (!(table in TABLE_SCHEMAS)) continue;
    const held = before[table as keyof typeof TABLE_SCHEMAS];
    if (id in held) continue;
    if (created.some((entry) => entry.table === table && entry.id === id))
      continue;
    created.push({ table, id });
  }
  return created;
}

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
  readonly #eventListeners = new Set<(event: DocumentEvent) => void>();
  readonly #metaListeners = new Set<() => void>();
  readonly #changeListeners = new Set<() => void>();

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
   * Replaces the whole content in place, as one delta that sets every table
   * of the Document, keeping the id, the subscribers and the operational
   * state. History is cleared. Reverting to the file as saved leaves the
   * document clean; content that came from elsewhere leaves it `dirty`.
   */
  replaceDocument(
    document: Document,
    sessionId: string,
    options: { readonly dirty?: boolean } = {},
  ): void {
    const patches: Patch[] = Object.keys(document)
      .filter((table) => table !== "operational")
      .map((table) => ({
        op: "set",
        path: [table],
        value: document[table as keyof Document],
      }));
    this.#history = new History();
    this.#commit(
      { ...document, operational: this.#document.operational },
      patches,
      sessionId,
    );
    this.#dirty = options.dirty ?? false;
    this.#recovered = false;
    this.#notifyMeta();
    if (this.#dirty) for (const listener of this.#changeListeners) listener();
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

  /** Fires for every trigger Address a command fires. */
  onEvent(listener: (event: DocumentEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  /** Fires when name, path or dirty state changes. */
  onMeta(listener: () => void): () => void {
    this.#metaListeners.add(listener);
    return () => this.#metaListeners.delete(listener);
  }

  /**
   * Fires after each change to the saved part of the document, the part the
   * file holds; a change to `operational` alone (Blackout) does not fire it.
   */
  onChange(listener: () => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
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
    const warnings =
      result.warnings.length === 0 ? {} : { warnings: result.warnings };
    const run = result.run === undefined ? {} : { run: result.run };
    if (result.patches.length === 0) {
      this.#announce(result.events, sessionId);
      return {
        ok: true,
        revision: this.#revision,
        changed: result.events.length > 0,
        ...warnings,
        ...run,
      };
    }

    const created = createdEntities(this.#document, result.patches);
    // The change lands before its events are announced, so a Macro that
    // enables a Layer and fires its Cue reaches an Output in that order.
    this.#commit(result.document, result.patches, sessionId);
    this.#announce(result.events, sessionId);
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
      this.#changed();
    return {
      ok: true,
      revision: this.#revision,
      changed: true,
      label: result.label,
      ...warnings,
      ...run,
      ...(created.length === 0 ? {} : { created }),
    };
  }

  #announce(events: readonly string[], sessionId: string): void {
    for (const address of events) {
      const event: DocumentEvent = {
        documentId: this.id,
        address,
        originSessionId: sessionId,
      };
      for (const listener of this.#eventListeners) listener(event);
    }
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
    this.#changed();
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

  /** The saved part changed: the document is dirty and the autosave clock restarts. */
  #changed(): void {
    if (!this.#dirty) {
      this.#dirty = true;
      this.#notifyMeta();
    }
    for (const listener of this.#changeListeners) listener();
  }

  #notifyMeta(): void {
    for (const listener of this.#metaListeners) listener();
  }
}
