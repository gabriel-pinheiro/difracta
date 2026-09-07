import {
  applyPatches,
  getAtPath,
  pathsOverlap,
  type Document,
  type Patch,
  type PatchPath,
} from "@difracta/core";

import { Signal, type ReadonlySignal } from "./signal.ts";

/**
 * The client-side replica of one Document. Listeners subscribe to a path and
 * are notified only when a delta touches it, so a control bound to
 * `["outputs", id, "name"]` re-renders for that value alone.
 */
export class DocumentView {
  readonly documentId: string;
  readonly document: Signal<Document | undefined>;
  readonly revision: Signal<number>;
  readonly #pathListeners = new Map<string, Set<() => void>>();

  constructor(documentId: string) {
    this.documentId = documentId;
    this.document = new Signal<Document | undefined>(undefined);
    this.revision = new Signal(0);
  }

  get(): Document | undefined {
    return this.document.get();
  }

  valueAt<TValue = unknown>(path: PatchPath): TValue | undefined {
    return getAtPath(this.document.get(), path) as TValue | undefined;
  }

  /** Notifies when any patch overlaps `path` (ancestor or descendant). */
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

  replaceSnapshot(document: Document, revision: number): void {
    this.document.set(document);
    this.revision.set(revision);
    for (const listeners of this.#pathListeners.values()) {
      for (const listener of listeners) listener();
    }
  }

  /** Returns false on a revision gap; the caller must resubscribe. */
  applyDelta(
    patches: readonly Patch[],
    fromRevision: number,
    revision: number,
  ): boolean {
    const current = this.document.get();
    if (current === undefined || fromRevision !== this.revision.get())
      return false;
    this.document.set(applyPatches(current, patches));
    this.revision.set(revision);
    for (const [key, listeners] of this.#pathListeners) {
      const path = key === "" ? [] : key.split("/");
      if (patches.some((patch) => pathsOverlap(patch.path, path))) {
        for (const listener of listeners) listener();
      }
    }
    return true;
  }
}
