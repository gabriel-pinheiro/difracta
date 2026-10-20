import {
  applyPatches,
  getAtPath,
  pathsOverlap,
  type Document,
  type Patch,
  type PatchPath,
} from "@difracta/core";
import {
  EMPTY_LIVE_STATE,
  type LiveState,
  type LiveRequest,
} from "@difracta/protocol";

import { Signal, type ReadonlySignal } from "./signal.ts";
import type { UnreadablePart } from "./snapshot-reading.ts";

/** What this client left out of a snapshot it read, and whether it could read it at all. */
export interface SnapshotReading {
  /**
   * Tables (`surfaces`) and live sections (`live/packs`) the runtime sent
   * that this client could not read; each holds its empty value.
   */
  readonly unreadable: readonly UnreadablePart[];
  /** Why the last snapshot could not be read at all; the view then holds none. */
  readonly failure?: string;
}

const READ_IN_FULL: SnapshotReading = { unreadable: [] };

/** Root segment under which the live state is addressed in paths. */
export const LIVE_ROOT = "live";

/**
 * The client-side replica of one Document, plus its live state when the view
 * was opened with `live`. Listeners subscribe to a path and are notified only
 * when a change touches it, so a control bound to `["outputs", id, "name"]`
 * re-renders for that value alone. Live values sit under the `live` root:
 * `["live", "outputs", id, "sessions"]`.
 *
 * A runtime built from other code than this client still replicates: the
 * snapshot is read a table at a time, what did not read is named in
 * `reading`, and later patches into it or into tables this client does not
 * know are dropped.
 */
export class DocumentView {
  readonly documentId: string;
  /** What of the live state the runtime was asked for: all of it, the sections named, or none (false). */
  readonly live: LiveRequest;
  readonly document: Signal<Document | undefined>;
  readonly liveState: Signal<LiveState>;
  readonly revision: Signal<number>;
  readonly reading = new Signal<SnapshotReading>(READ_IN_FULL);
  #skipped: ReadonlySet<string> = new Set();
  #liveSkipped: ReadonlySet<string> = new Set();
  readonly #pathListeners = new Map<string, Set<() => void>>();
  readonly #eventListeners = new Set<(address: string) => void>();

  constructor(
    documentId: string,
    options: { readonly live?: LiveRequest } = {},
  ) {
    this.documentId = documentId;
    this.live = options.live ?? false;
    this.document = new Signal<Document | undefined>(undefined);
    this.liveState = new Signal<LiveState>(EMPTY_LIVE_STATE);
    this.revision = new Signal(0);
  }

  get(): Document | undefined {
    return this.document.get();
  }

  valueAt<TValue = unknown>(path: PatchPath): TValue | undefined {
    const [root, ...rest] = path;
    const source = root === LIVE_ROOT ? this.liveState.get() : undefined;
    if (source !== undefined)
      return getAtPath(source, rest) as TValue | undefined;
    return getAtPath(this.document.get(), path) as TValue | undefined;
  }

  /** Notifies when any change overlaps `path` (ancestor or descendant). */
  subscribePath(path: PatchPath, listener: () => void): () => void {
    const key = path.join("/");
    let listeners = this.#pathListeners.get(key);
    if (listeners === undefined) {
      listeners = new Set();
      this.#pathListeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#pathListeners.delete(key);
    };
  }

  /** Notifies of every trigger Address fired in this document, such as a Layer's Cue. */
  subscribeEvents(listener: (address: string) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  /** @internal The runtime announced a fired trigger Address. */
  receiveEvent(address: string): void {
    for (const listener of this.#eventListeners) listener(address);
  }

  /** A signal-like view of one path, for framework bindings. */
  at<TValue = unknown>(path: PatchPath): ReadonlySignal<TValue | undefined> {
    return {
      get: () => this.valueAt<TValue>(path),
      subscribe: (listener) =>
        this.subscribePath(path, () => {
          listener(this.valueAt<TValue>(path));
        }),
    };
  }

  replaceSnapshot(
    document: Document,
    revision: number,
    live: LiveState = EMPTY_LIVE_STATE,
    left: {
      readonly reading?: SnapshotReading;
      /** Tables whose patches are dropped. */
      readonly skipped?: ReadonlySet<string>;
      /** Live sections whose patches are dropped. */
      readonly liveSkipped?: ReadonlySet<string>;
    } = {},
  ): void {
    this.#skipped = left.skipped ?? new Set();
    this.#liveSkipped = left.liveSkipped ?? new Set();
    this.reading.set(left.reading ?? READ_IN_FULL);
    this.document.set(document);
    this.liveState.set(live);
    this.revision.set(revision);
    for (const listeners of this.#pathListeners.values()) {
      for (const listener of listeners) listener();
    }
  }

  /**
   * Returns false on a revision gap; the caller must resubscribe. A view
   * whose snapshot could not be read ignores deltas instead: subscribing
   * again would only send the same snapshot.
   */
  applyDelta(
    patches: readonly Patch[],
    fromRevision: number,
    revision: number,
  ): boolean {
    if (this.reading.get().failure !== undefined) return true;
    const current = this.document.get();
    if (current === undefined || fromRevision !== this.revision.get())
      return false;
    const kept = this.#keep(patches, this.#skipped);
    this.document.set(applyPatches(current, kept));
    this.revision.set(revision);
    this.#notify(kept.map((patch) => patch.path));
    return true;
  }

  /** Live patches are relative to the live root and carry no revision. */
  applyLive(patches: readonly Patch[]): void {
    const kept = this.#keep(patches, this.#liveSkipped);
    this.liveState.set(applyPatches(this.liveState.get(), kept));
    this.#notify(kept.map((patch) => [LIVE_ROOT, ...patch.path]));
  }

  /** @internal The runtime sent a snapshot this client could not read: no document until the next one. */
  refuseSnapshot(failure: string): void {
    this.reading.set({ unreadable: [], failure });
    this.document.set(undefined);
  }

  #keep(patches: readonly Patch[], skipped: ReadonlySet<string>): Patch[] {
    return skipped.size === 0
      ? [...patches]
      : patches.filter((patch) => !skipped.has(patch.path[0] ?? ""));
  }

  #notify(changed: readonly PatchPath[]): void {
    for (const [key, listeners] of this.#pathListeners) {
      const path = key === "" ? [] : key.split("/");
      if (changed.some((candidate) => pathsOverlap(candidate, path))) {
        for (const listener of listeners) listener();
      }
    }
  }
}
