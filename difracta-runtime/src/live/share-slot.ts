import { generateId, type Patch } from "@difracta/core";
import type {
  ServerMessage,
  ShareDeclaration,
  ShareEndReason,
  ShareLive,
  ShareViewing,
} from "@difracta/protocol";

/** What a slot needs from the runtime around it. */
export interface SlotContext {
  /** Sends to one connection; false when it is gone. */
  readonly send: (sessionId: string, message: ServerMessage) => boolean;
  /** Live-state patches, relative to the live root. */
  readonly emit: (patches: readonly Patch[]) => void;
  readonly now: () => number;
  readonly interruptedForMs: number;
}

/** One share of a slot, from its first declaration until it ends. */
export interface Share {
  /** Changes when another share starts in the slot, so Viewers drop what they had. */
  readonly id: string;
  /** The Sharer's connection; undefined while interrupted. */
  sessionId: string | undefined;
  readonly actor: string;
  sharer: string;
  source: ShareDeclaration["source"];
  /** Epoch ms of the first declaration, kept across an interruption. */
  readonly since: number;
  /** The Viewers the Sharer has been told of; drifts from the slot's while it is away. */
  readonly announced: Set<string>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * One Screen Share slot: its share, if any, and its Viewers, waiting ones
 * included. It tells the Sharer of each Viewer that joins or leaves, tells
 * each Viewer when the share changes, relays payloads between them and
 * replicates its state under `["shares", id]`, one patch per property.
 * Whether a declaration or a Viewer is taken is `screen-shares.ts`'s call.
 */
export class ShareSlot {
  readonly id: string;
  readonly viewers = new Set<string>();
  readonly #context: SlotContext;
  #share: Share | undefined;

  constructor(id: string, context: SlotContext) {
    this.id = id;
    this.#context = context;
  }

  get share(): Readonly<Share> | undefined {
    return this.#share;
  }

  live(): ShareLive {
    const share = this.#share;
    if (share === undefined) return { status: "idle" };
    return {
      status: share.sessionId === undefined ? "interrupted" : "live",
      sharer: share.sharer,
      source: share.source,
      since: share.since,
      viewers: this.viewers.size,
    };
  }

  viewing(): ShareViewing {
    const share = this.#share;
    if (share === undefined) return { status: "idle" };
    const status = share.sessionId === undefined ? "interrupted" : "live";
    return { status, share: share.id };
  }

  /** A new share, replacing whatever the slot had: every Viewer is announced to the Sharer. */
  start(sessionId: string, actor: string, declaration: ShareDeclaration): void {
    clearTimeout(this.#share?.timer);
    const share: Share = {
      id: generateId("share"),
      sessionId,
      actor,
      sharer: declaration.sharer,
      source: declaration.source,
      since: this.#context.now(),
      announced: new Set(),
      timer: undefined,
    };
    this.#share = share;
    this.#set();
    this.#tellViewers();
    for (const viewer of this.viewers) this.#announce(share, viewer);
  }

  /** The same Sharer is back: Viewers that came while it was away are announced, those that left too. */
  resume(sessionId: string, declaration: ShareDeclaration): void {
    const share = this.#share;
    if (share === undefined) return;
    clearTimeout(share.timer);
    share.timer = undefined;
    share.sessionId = sessionId;
    this.#patch("status", "live");
    this.update(declaration);
    this.#tellViewers();
    for (const viewer of [...share.announced])
      if (!this.viewers.has(viewer)) this.#forget(share, viewer);
    for (const viewer of this.viewers)
      if (!share.announced.has(viewer)) this.#announce(share, viewer);
  }

  update(declaration: ShareDeclaration): void {
    const share = this.#share;
    if (share === undefined) return;
    if (share.sharer !== declaration.sharer) {
      share.sharer = declaration.sharer;
      this.#patch("sharer", share.sharer);
    }
    if (share.source !== declaration.source) {
      share.source = declaration.source;
      this.#patch("source", share.source);
    }
  }

  /** Tells a connected Sharer its share ended; the slot's state is the caller's to change. */
  end(reason: ShareEndReason, message: string): void {
    const share = this.#share;
    if (share?.sessionId === undefined) return;
    this.#context.send(share.sessionId, {
      type: "share-ended",
      mediaId: this.id,
      reason,
      message,
    });
  }

  idle(): void {
    clearTimeout(this.#share?.timer);
    this.#share = undefined;
    this.#set();
    this.#tellViewers();
  }

  /** The Sharer's connection closed: the share waits for it, then falls to idle. */
  interrupt(): void {
    const share = this.#share;
    if (share?.sessionId === undefined) return;
    share.sessionId = undefined;
    share.timer = setTimeout(() => this.idle(), this.#context.interruptedForMs);
    this.#patch("status", "interrupted");
    this.#tellViewers();
  }

  /** Adds a Viewer, or asks the Sharer for a new offer to one already here. */
  join(viewerId: string): void {
    const added = !this.viewers.has(viewerId);
    this.viewers.add(viewerId);
    this.tell(viewerId, this.viewing());
    const share = this.#share;
    if (share?.sessionId !== undefined) this.#announce(share, viewerId);
    if (added) this.#patchViewers();
  }

  leave(viewerId: string): void {
    if (!this.viewers.delete(viewerId)) return;
    const share = this.#share;
    if (share?.sessionId !== undefined) this.#forget(share, viewerId);
    this.#patchViewers();
  }

  /** From the Sharer to one of the slot's Viewers; anything else is dropped. */
  toViewer(from: string, viewerId: string, payload: unknown): void {
    const sharer = this.#share?.sessionId;
    if (sharer === undefined || sharer !== from || !this.viewers.has(viewerId))
      return;
    this.#context.send(viewerId, {
      type: "share-signal",
      mediaId: this.id,
      payload,
    });
  }

  /** From a Viewer to the connected Sharer; anything else is dropped. */
  toSharer(from: string, payload: unknown): void {
    const sharer = this.#share?.sessionId;
    if (sharer === undefined || !this.viewers.has(from)) return;
    this.#context.send(sharer, {
      type: "share-signal",
      mediaId: this.id,
      viewerId: from,
      payload,
    });
  }

  tell(viewerId: string, viewing: ShareViewing): void {
    this.#context.send(viewerId, {
      type: "share-viewing",
      mediaId: this.id,
      viewing,
    });
  }

  close(): void {
    clearTimeout(this.#share?.timer);
  }

  #tellViewers(): void {
    const viewing = this.viewing();
    for (const viewer of this.viewers) this.tell(viewer, viewing);
  }

  #announce(share: Share, viewerId: string): void {
    share.announced.add(viewerId);
    if (share.sessionId !== undefined)
      this.#context.send(share.sessionId, {
        type: "share-viewer",
        mediaId: this.id,
        viewerId,
        joined: true,
      });
  }

  #forget(share: Share, viewerId: string): void {
    if (!share.announced.delete(viewerId) || share.sessionId === undefined)
      return;
    this.#context.send(share.sessionId, {
      type: "share-viewer",
      mediaId: this.id,
      viewerId,
      joined: false,
    });
  }

  #patchViewers(): void {
    if (this.#share !== undefined) this.#patch("viewers", this.viewers.size);
  }

  #set(): void {
    this.#context.emit([
      { op: "set", path: ["shares", this.id], value: this.live() },
    ]);
  }

  #patch(key: string, value: unknown): void {
    this.#context.emit([{ op: "set", path: ["shares", this.id, key], value }]);
  }
}
