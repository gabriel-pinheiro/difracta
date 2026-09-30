import {
  Signal,
  type DifractaClient,
  type DocumentView,
} from "@difracta/client";
import { generateId, type Media, type Table } from "@difracta/core";

import { shareSlots, type ShareSlot } from "./share-slots";
import type { Sharer } from "./sharer";

/** The open Installation, as far as the share window names it. */
export interface OpenInstallation {
  readonly id: string;
  readonly name: string;
}

/**
 * What the share window reads of the runtime: the open Installation and
 * its Screen Shares with who shares into each, followed through the page's
 * own connection like any client's. `slots` changes only when a slot does,
 * so a show being busked next to it redraws nothing here.
 */
export class ShareInstallation {
  readonly installation = new Signal<OpenInstallation | null>(null);
  readonly slots = new Signal<readonly ShareSlot[]>([]);
  readonly #client: DifractaClient;
  readonly #sharer: Sharer;
  readonly #unsubscribe: (() => void)[];
  #view: DocumentView | undefined;
  #unfollow: (() => void)[] = [];
  #said = "[]";

  constructor(client: DifractaClient, sharer: Sharer) {
    this.#client = client;
    this.#sharer = sharer;
    this.#unsubscribe = [
      client.document.subscribe(() => this.#follow()),
      sharer.shares.subscribe(() => this.#read()),
    ];
    this.#follow();
  }

  /** Adds a Screen Share to the Installation; resolves with its id. */
  async createSlot(): Promise<string> {
    const installation = this.installation.get();
    if (installation === null) throw new Error("No Installation is open.");
    const id = generateId("media");
    await this.#client.command(installation.id, "media.create", {
      id,
      kind: "share",
    });
    return id;
  }

  /** Whether the runtime still says this computer shares into any of `slots`. */
  stillShared(slots: readonly string[], sharer: string): boolean {
    const live = this.#view?.liveState.get().media ?? {};
    return slots.some((id) => {
      const entry = live[id];
      return (
        entry !== undefined && "sharer" in entry && entry.sharer === sharer
      );
    });
  }

  /** Calls back on every change of who shares into what. Returns the unsubscribe. */
  onLive(listener: () => void): () => void {
    return this.#view?.subscribePath(["live", "media"], listener) ?? (() => 0);
  }

  dispose(): void {
    for (const unsubscribe of [...this.#unsubscribe, ...this.#unfollow])
      unsubscribe();
  }

  /** Follows the Installation the runtime has open now. */
  #follow(): void {
    const summary = this.#client.document.get();
    const open =
      summary === null ? null : { id: summary.id, name: summary.name };
    const before = this.installation.get();
    if (before?.id !== open?.id) {
      for (const unfollow of this.#unfollow) unfollow();
      if (before !== null) this.#client.closeDocument(before.id);
      this.#view =
        open === null
          ? undefined
          : this.#client.openDocument(open.id, { live: true });
      const read = (): void => this.#read();
      this.#unfollow =
        this.#view === undefined
          ? []
          : [
              this.#view.subscribePath(["media"], read),
              this.#view.subscribePath(["live", "media"], read),
            ];
    }
    if (before?.id !== open?.id || before?.name !== open?.name)
      this.installation.set(open);
    this.#read();
  }

  #read(): void {
    const view = this.#view;
    const slots = shareSlots(
      view?.valueAt<Table<Media>>(["media"]),
      view?.liveState.get().media ?? {},
      new Set(this.#sharer.shares.get().map((share) => share.mediaId)),
    );
    const said = JSON.stringify(slots);
    if (said === this.#said) return;
    this.#said = said;
    this.slots.set(slots);
  }
}
