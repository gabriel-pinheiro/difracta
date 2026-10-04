import { settings, type Document, type Patch } from "@difracta/core";
import type {
  ClientKind,
  ClientMessage,
  ServerMessage,
  ShareDeclaration,
  ShareLive,
  ShareStopResult,
} from "@difracta/protocol";

import type { ReplyOutcome } from "./client-session.ts";
import { shareMessages as say } from "./share-messages.ts";
import { ShareSlot } from "./share-slot.ts";

export type ShareClientMessage = Extract<
  ClientMessage,
  { type: "share" | "share-view" | "share-signal" }
>;

/** The connection a message came from, as far as shares care. */
export interface ShareClient {
  readonly id: string;
  readonly kind: ClientKind | undefined;
  /** Recognises a Sharer across reconnects: `hello`'s actor, else the session id. */
  readonly actor: string;
}

export interface ScreenSharesOptions {
  /** The open Installation's Screen Shares; undefined when none is open. */
  readonly document: () => Pick<Document, "shares"> | undefined;
  /** Sends to one connection; false when it is gone. */
  readonly send: (sessionId: string, message: ServerMessage) => boolean;
  readonly now?: () => number;
  readonly interruptedForMs?: number;
  readonly maxViewers?: number;
}

/**
 * The Screen Shares of the open Installation: one slot per Screen Share
 * (`share-slot.ts`), who shares into it and who views it. This
 * decides what is taken: a declaration from a `desktop` connection for a
 * slot of the open Installation, a Viewer while the slot has room.
 *
 * A second Sharer replaces the first. A Sharer is recognised across
 * reconnects by its actor: while its share is `interrupted`, a declaration
 * marked `resume` (sent again after a reconnect) from a connection with the
 * same actor takes it back, keeping its id and `since`, so the Viewers keep
 * the peer connections they have. A `resume` takes a slot only while nobody
 * else shares into it, so a Sharer that was replaced while away does not
 * take the slot back. A declaration without it is always a new share, from
 * the same actor too: a Sharer that started again holds no connection to
 * any Viewer, so every Viewer is announced to it.
 *
 * Shares belong to connections and slots, not to the document: replacing
 * the document keeps a share whose slot the new one still has, by id, and
 * ends the others.
 */
export class ScreenShares {
  readonly #options: ScreenSharesOptions;
  readonly #slots = new Map<string, ShareSlot>();
  readonly #listeners = new Set<(patches: readonly Patch[]) => void>();

  constructor(options: ScreenSharesOptions) {
    this.#options = options;
  }

  onChange(listener: (patches: readonly Patch[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Every slot's entry: the live state's `shares`. */
  state(): Record<string, ShareLive> {
    return Object.fromEntries(
      [...this.#slots].map(([id, slot]) => [id, slot.live()]),
    );
  }

  /** Follows the open document's Screen Shares: new slots start idle, gone ones end their share. */
  reconcile(): void {
    const shares = this.#options.document()?.shares;
    const ids = new Set<string>(Object.keys(shares ?? {}));
    for (const [id, slot] of [...this.#slots]) {
      if (ids.has(id)) continue;
      this.#slots.delete(id);
      slot.close();
      this.#emit([{ op: "remove", path: ["shares", id] }]);
      const why = shares === undefined ? say.noInstallation : say.gone(id);
      slot.end("removed", why);
      for (const viewer of slot.viewers)
        slot.tell(viewer, { status: "refused", error: why });
    }
    for (const id of ids) {
      if (this.#slots.has(id)) continue;
      const slot = new ShareSlot(id, {
        send: this.#options.send,
        emit: (patches) => this.#emit(patches),
        now: this.#options.now ?? Date.now,
        interruptedForMs:
          this.#options.interruptedForMs ?? settings.shares.interruptedForMs,
      });
      this.#slots.set(id, slot);
      this.#emit([{ op: "set", path: ["shares", id], value: slot.live() }]);
    }
  }

  /** One of the Screen Share messages a client sends. */
  receive(client: ShareClient, message: ShareClientMessage): void {
    switch (message.type) {
      case "share":
        this.declare(
          client,
          message.mediaId,
          message.share,
          message.resume ?? false,
        );
        break;
      case "share-view":
        this.view(client, message.mediaId, message.view);
        break;
      case "share-signal":
        if (message.viewerId === undefined)
          this.#slots
            .get(message.mediaId)
            ?.toSharer(client.id, message.payload);
        else
          this.#slots
            .get(message.mediaId)
            ?.toViewer(client.id, message.viewerId, message.payload);
        break;
    }
  }

  /** A Sharer declares, updates or stops (null) its share of a slot. */
  declare(
    client: ShareClient,
    mediaId: string,
    declaration: ShareDeclaration | null,
    resume: boolean,
  ): void {
    const slot = this.#slots.get(mediaId);
    const current = slot?.share;
    if (declaration === null) {
      if (slot !== undefined && current?.sessionId === client.id) slot.idle();
      return;
    }
    const refuse = (reason: "refused" | "replaced", message: string): void => {
      this.#options.send(client.id, {
        type: "share-ended",
        mediaId,
        reason,
        message,
      });
    };
    if (client.kind !== "desktop") {
      refuse("refused", say.notDesktop(client.kind));
      return;
    }
    if (slot === undefined) {
      refuse("refused", this.#missing(mediaId));
      return;
    }
    if (current?.sessionId === client.id) {
      slot.update(declaration);
      return;
    }
    if (
      resume &&
      current?.sessionId === undefined &&
      current?.actor === client.actor
    ) {
      slot.resume(client.id, declaration);
      return;
    }
    if (resume && current !== undefined) {
      refuse("replaced", say.takenMeanwhile(this.#name(mediaId)));
      return;
    }
    slot.end("replaced", say.replaced(declaration, this.#name(mediaId)));
    slot.start(client.id, client.actor, declaration);
  }

  /** `shares.stop`: ends whatever share the slot has; its Sharer hears so. */
  stop(mediaId: string): ReplyOutcome {
    const slot = this.#slots.get(mediaId);
    if (slot === undefined) return { ok: false, error: this.#missing(mediaId) };
    const share = slot.share;
    if (share === undefined)
      return { ok: false, error: say.notShared(this.#name(mediaId)) };
    slot.end("stopped", say.stopped);
    slot.idle();
    const result: ShareStopResult = { mediaId, sharer: share.sharer };
    return { ok: true, result };
  }

  /** A connection views a slot (again, to ask for a new offer), or leaves it. */
  view(client: ShareClient, mediaId: string, view: boolean): void {
    const slot = this.#slots.get(mediaId);
    if (!view) {
      slot?.leave(client.id);
      return;
    }
    if (slot === undefined) {
      this.#options.send(client.id, {
        type: "share-viewing",
        mediaId,
        viewing: { status: "refused", error: this.#missing(mediaId) },
      });
      return;
    }
    const max = this.#options.maxViewers ?? settings.shares.maxViewers;
    if (!slot.viewers.has(client.id) && slot.viewers.size >= max) {
      slot.tell(client.id, {
        status: "refused",
        error: say.full(this.#name(mediaId), max),
      });
      return;
    }
    slot.join(client.id);
  }

  /** A closed socket: it stops viewing, and its shares wait for it, interrupted. */
  disconnected(sessionId: string): void {
    for (const slot of this.#slots.values()) {
      slot.leave(sessionId);
      if (slot.share?.sessionId === sessionId) slot.interrupt();
    }
  }

  close(): void {
    for (const slot of this.#slots.values()) slot.close();
    this.#slots.clear();
  }

  #name(mediaId: string): string {
    return this.#options.document()?.shares[mediaId]?.name ?? mediaId;
  }

  /** Why `mediaId` is no slot of the open Installation. */
  #missing(mediaId: string): string {
    const document = this.#options.document();
    if (document === undefined) return say.noInstallation;
    return say.gone(mediaId);
  }

  #emit(patches: readonly Patch[]): void {
    for (const listener of this.#listeners) listener(patches);
  }
}
