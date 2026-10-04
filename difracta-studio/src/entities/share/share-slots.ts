import { orderedEntries, type Share, type Table } from "@difracta/core";
import type { ShareLive } from "@difracta/protocol";

/**
 * A Screen Share of the open Installation with who shares into it, read
 * from the live state: what the share window offers, and what Studio's
 * status strip lists.
 */
export interface ShareSlot {
  /** The Screen Share's id. */
  readonly id: string;
  readonly name: string;
  /** Who shares into it now; undefined while nobody does. */
  readonly sharer?: string;
  /** That Sharer's connection dropped and the runtime waits for it. */
  readonly interrupted: boolean;
  /** This computer shares into it. */
  readonly mine: boolean;
}

const IDLE: ShareLive = { status: "idle" };
const NOBODY: ReadonlySet<string> = new Set();

/** A Screen Share's entry under `["live", "shares", <id>]`, `idle` while the runtime has said nothing of it yet. */
export function shareLive(entry: ShareLive | undefined): ShareLive {
  if (entry === undefined) return IDLE;
  if (entry.status === "idle") return IDLE;
  return "sharer" in entry ? entry : IDLE;
}

/**
 * The Installation's Screen Shares in navigator order, each with who shares
 * into it according to the live state. `mine` names the slots this
 * computer shares into, which only the share window knows.
 */
export function shareSlots(
  shares: Table<Share> | undefined,
  live: Readonly<Record<string, ShareLive | undefined>>,
  mine: ReadonlySet<string> = NOBODY,
): ShareSlot[] {
  if (shares === undefined) return [];
  return orderedEntries(shares).map((item) => {
    const shared = shareLive(live[item.id]);
    return {
      id: item.id,
      name: item.name,
      ...(shared.status === "idle" ? {} : { sharer: shared.sharer }),
      interrupted: shared.status === "interrupted",
      mine: mine.has(item.id),
    };
  });
}

/** The slots somebody shares into now, interrupted ones included: Studio's reminder. */
export function activeShares(
  shares: Table<Share> | undefined,
  live: Readonly<Record<string, ShareLive | undefined>>,
): ShareSlot[] {
  return shareSlots(shares, live).filter((slot) => slot.sharer !== undefined);
}

/** What the share window's list says under a slot's name. */
export function slotStatus(slot: ShareSlot): string {
  if (slot.mine) return "This computer shares into it";
  if (slot.sharer === undefined) return "Nobody shares into it";
  return slot.interrupted
    ? `${slot.sharer} was sharing into it and lost its connection`
    : `${slot.sharer} shares into it; sharing takes its place`;
}
