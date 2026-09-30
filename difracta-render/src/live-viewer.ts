import { settings, type Media, type Table } from "@difracta/core";

import {
  BROWSER_TIMERS,
  browserElement,
  browserPeer,
  type LiveViewerOptions,
} from "./live-peer.ts";
import { LiveSlot, type SlotContext } from "./live-slot.ts";
import type { MediaLive } from "./sdk/media.ts";

/** The Screen Shares a page views, the ones whose picture arrives, and why one was refused. */
export interface ShareCount {
  readonly viewed: number;
  readonly connected: number;
  /** The runtime's words for the first slot that refused this Viewer. */
  readonly refused?: string;
}

const NO_SHARES: ShareCount = { viewed: 0, connected: 0 };

interface Entry {
  readonly slot: LiveSlot;
  /** Set while nothing wants the slot: what ends the viewing. */
  leaving: unknown;
}

/**
 * The engine's Viewer: the Screen Shares this page receives, one slot
 * (`live-slot.ts`) per share wanted. It views on demand: `sync` is told
 * which slots are wanted now (`live-wanted.ts`), views the new ones and
 * leaves one `settings.shares.viewer.leaveAfterMs` after it stopped being
 * wanted, or at once when the `media` table lost it. An instance reads a
 * slot through `live(id)`, as `media.live` in its context. Kept outside
 * the GPU resources like the Media loader, so a lost context costs no
 * renegotiation.
 */
export class LiveViewer {
  readonly #context: SlotContext | undefined;
  readonly #entries = new Map<string, Entry>();
  readonly #unsubscribe: readonly (() => void)[];
  #wanted: ReadonlySet<string> | undefined;
  #table: Table<Media> | undefined;

  constructor(options: LiveViewerOptions = {}) {
    const { signalling } = options;
    if (signalling === undefined) {
      this.#unsubscribe = [];
      return;
    }
    this.#context = {
      signalling,
      createPeer: options.createPeer ?? browserPeer,
      createElement: options.createElement ?? browserElement,
      timers: options.timers ?? BROWSER_TIMERS,
    };
    this.#unsubscribe = [
      signalling.onViewing((id, viewing) =>
        this.#entries.get(id)?.slot.viewing(viewing),
      ),
      signalling.onSignal((id, payload) =>
        this.#entries.get(id)?.slot.signal(payload),
      ),
    ];
  }

  /** Brings the slots in step with what is wanted; the same set and table cost nothing. */
  sync(wanted: ReadonlySet<string>, media: Table<Media>): void {
    const context = this.#context;
    if (context === undefined) return;
    if (wanted === this.#wanted && media === this.#table) return;
    this.#wanted = wanted;
    this.#table = media;
    const { timers, signalling } = context;
    for (const id of wanted) {
      const entry = this.#entries.get(id);
      if (entry !== undefined) {
        timers.clear(entry.leaving);
        entry.leaving = undefined;
        continue;
      }
      const slot = new LiveSlot(id, context);
      this.#entries.set(id, { slot, leaving: undefined });
      signalling.view(id);
      // Already viewed by this connection, by an engine before this one: the answer is known.
      const known = signalling.state(id);
      if (known !== undefined) {
        slot.viewing(known);
        signalling.requestOffer(id);
      }
    }
    for (const [id, entry] of this.#entries) {
      if (wanted.has(id)) continue;
      if (media[id]?.kind !== "share") this.#leave(id);
      else
        entry.leaving ??= timers.set(
          () => this.#leave(id),
          settings.shares.viewer.leaveAfterMs,
        );
    }
  }

  live(id: string): MediaLive | undefined {
    return this.#entries.get(id)?.slot.live;
  }

  shares(): ShareCount {
    if (this.#entries.size === 0) return NO_SHARES;
    let connected = 0;
    let refused: string | undefined;
    for (const { slot } of this.#entries.values()) {
      if (slot.connected) connected += 1;
      refused ??= slot.refused;
    }
    return {
      viewed: this.#entries.size,
      connected,
      ...(refused === undefined ? {} : { refused }),
    };
  }

  dispose(): void {
    for (const id of [...this.#entries.keys()]) this.#leave(id);
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#wanted = undefined;
    this.#table = undefined;
  }

  #leave(id: string): void {
    const entry = this.#entries.get(id);
    if (entry === undefined || this.#context === undefined) return;
    this.#context.timers.clear(entry.leaving);
    this.#entries.delete(id);
    entry.slot.close();
    this.#context.signalling.leave(id);
  }
}
