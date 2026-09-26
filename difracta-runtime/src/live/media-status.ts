import type { Patch } from "@difracta/core";
import type { LiveState, MediaLive } from "@difracta/protocol";

import {
  mediaStatusOf,
  type MediaServing,
  type MediaSource,
} from "../documents/media-files.ts";

/** A source's Media table and path, taken when a refresh is asked for. */
interface Snapshot {
  readonly document: MediaSource["document"];
  readonly path: string | null;
}

/**
 * Whether each Media item's file is there, under `["media", id]` in the
 * live state; a bundled item's is `unavailable` when the Catalog lacks its
 * entry. The runtime stats every file on each refresh: when a document
 * opens or is replaced, when it is saved to a new path and after any command
 * that touches `media`. There is no file watcher. Refreshes are serialized
 * and a refresh asked for while one runs follows it, with the newest
 * snapshot, so the state always ends at the latest document.
 */
export class MediaStatuses {
  readonly #entries = new Map<string, MediaLive>();
  readonly #listeners = new Set<(patches: readonly Patch[]) => void>();
  readonly #serving: MediaServing;
  #queued: Snapshot | null | undefined;
  #running: Promise<void> | undefined;

  constructor(serving: MediaServing) {
    this.#serving = serving;
  }

  onChange(listener: (patches: readonly Patch[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  state(): Pick<LiveState, "media"> {
    return { media: Object.fromEntries(this.#entries) };
  }

  /** Recomputes for `source`, or clears everything for none; resolves once the state is settled. */
  refresh(source: MediaSource | undefined): Promise<void> {
    this.#queued =
      source === undefined
        ? null
        : { document: { media: source.document.media }, path: source.path };
    this.#running ??= this.#drain();
    return this.#running;
  }

  close(): void {
    this.#entries.clear();
    this.#queued = undefined;
  }

  async #drain(): Promise<void> {
    while (this.#queued !== undefined) {
      const next = this.#queued;
      this.#queued = undefined;
      await this.#compute(next);
    }
    this.#running = undefined;
  }

  async #compute(snapshot: Snapshot | null): Promise<void> {
    const next = new Map<string, MediaLive>();
    if (snapshot !== null)
      for (const id of Object.keys(snapshot.document.media)) {
        const status = await mediaStatusOf(snapshot, id, this.#serving);
        if (status !== undefined) next.set(id, { status });
      }
    const patches: Patch[] = [];
    for (const id of this.#entries.keys())
      if (!next.has(id)) patches.push({ op: "remove", path: ["media", id] });
    for (const [id, entry] of next)
      if (this.#entries.get(id)?.status !== entry.status)
        patches.push({ op: "set", path: ["media", id], value: entry });
    this.#entries.clear();
    for (const [id, entry] of next) this.#entries.set(id, entry);
    if (patches.length > 0)
      for (const listener of this.#listeners) listener(patches);
  }
}
