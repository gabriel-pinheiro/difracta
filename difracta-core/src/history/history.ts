import { patchesOverlap, type Patch } from "../document/patch.ts";
import { settings } from "../settings.ts";

/**
 * Per-document undo history. Entries record who made them so Studio's Ctrl+Z
 * undoes Studio's own last step while a CLI session undoes its own; `global`
 * pops anyone's. An entry cannot be undone if a later entry from another
 * session touched the same paths; the caller reports that instead of
 * clobbering someone else's work. Entries are never persisted.
 *
 * Consecutive entries with the same coalesce key from one session, each within
 * `settings.history.coalesceWindowMs` of the previous, merge into one step:
 * a slider drag or a burst of renames undoes as one.
 */
export interface HistoryEntry {
  readonly id: number;
  readonly sessionId: string;
  readonly label: string;
  readonly forward: readonly Patch[];
  readonly inverse: readonly Patch[];
  readonly coalesceKey: string | undefined;
  readonly at: number;
}

export interface HistoryPushInput {
  readonly sessionId: string;
  readonly label: string;
  readonly forward: readonly Patch[];
  readonly inverse: readonly Patch[];
  readonly coalesceKey?: string | undefined;
  readonly at?: number;
}

export interface HistoryOptions {
  readonly coalesceWindowMs?: number;
  readonly limit?: number;
}

export type HistoryStep =
  | {
      readonly ok: true;
      readonly entry: HistoryEntry;
      readonly patches: readonly Patch[];
    }
  | { readonly ok: false; readonly error: string };

export class History {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  readonly #coalesceWindowMs: number;
  readonly #limit: number;
  #nextId = 1;

  constructor(options: HistoryOptions = {}) {
    this.#coalesceWindowMs =
      options.coalesceWindowMs ?? settings.history.coalesceWindowMs;
    this.#limit = options.limit ?? settings.history.limit;
  }

  push(input: HistoryPushInput): void {
    const at = input.at ?? Date.now();
    const top = this.#undo.at(-1);
    this.#redo.length = 0;
    if (
      top !== undefined &&
      input.coalesceKey !== undefined &&
      top.coalesceKey === input.coalesceKey &&
      top.sessionId === input.sessionId &&
      at - top.at <= this.#coalesceWindowMs
    ) {
      this.#undo[this.#undo.length - 1] = {
        ...top,
        at,
        forward: [...top.forward, ...input.forward],
        inverse: [...input.inverse, ...top.inverse],
      };
      return;
    }
    this.#undo.push({
      id: this.#nextId++,
      sessionId: input.sessionId,
      label: input.label,
      forward: input.forward,
      inverse: input.inverse,
      coalesceKey: input.coalesceKey,
      at,
    });
    if (this.#undo.length > this.#limit) this.#undo.shift();
  }

  undo(sessionId: string, global = false): HistoryStep {
    const index = this.#findLast(this.#undo, sessionId, global);
    const entry = this.#undo[index];
    if (entry === undefined) return { ok: false, error: "Nothing to undo." };
    const later = this.#undo.slice(index + 1);
    if (later.some((other) => patchesOverlap(other.forward, entry.inverse))) {
      return {
        ok: false,
        error: `Cannot undo “${entry.label}”: a later change touched the same values.`,
      };
    }
    this.#undo.splice(index, 1);
    this.#redo.push(entry);
    return { ok: true, entry, patches: entry.inverse };
  }

  redo(sessionId: string, global = false): HistoryStep {
    const index = this.#findLast(this.#redo, sessionId, global);
    const entry = this.#redo[index];
    if (entry === undefined) return { ok: false, error: "Nothing to redo." };
    this.#redo.splice(index, 1);
    this.#undo.push(entry);
    return { ok: true, entry, patches: entry.forward };
  }

  peekUndo(sessionId: string, global = false): HistoryEntry | undefined {
    const index = this.#findLast(this.#undo, sessionId, global);
    return index === -1 ? undefined : this.#undo[index];
  }

  peekRedo(sessionId: string, global = false): HistoryEntry | undefined {
    const index = this.#findLast(this.#redo, sessionId, global);
    return index === -1 ? undefined : this.#redo[index];
  }

  #findLast(
    stack: readonly HistoryEntry[],
    sessionId: string,
    global: boolean,
  ): number {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (global || stack[index]?.sessionId === sessionId) return index;
    }
    return -1;
  }
}
