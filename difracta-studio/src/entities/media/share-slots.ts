import {
  flattenMedia,
  qualifiedName,
  type Media,
  type Table,
} from "@difracta/core";
import type { MediaLive, ShareLive } from "@difracta/protocol";

/**
 * A Screen Share of the open Installation with who shares into it, read
 * from the live state: what the share window offers, and what Studio's
 * status strip lists.
 */
export interface ShareSlot {
  /** The Media item's id. */
  readonly id: string;
  /** Its name, its Groups' before it. */
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

/**
 * A Screen Share's entry under `["live", "media", <id>]`, `idle` while the
 * runtime has said nothing of it yet or says something that is not a
 * share's (an id a file had a moment ago).
 */
export function shareLive(entry: MediaLive | undefined): ShareLive {
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
  media: Table<Media> | undefined,
  live: Readonly<Record<string, MediaLive | undefined>>,
  mine: ReadonlySet<string> = NOBODY,
): ShareSlot[] {
  if (media === undefined) return [];
  return flattenMedia(media)
    .filter((item) => item.kind === "share")
    .map((item) => {
      const shared = shareLive(live[item.id]);
      return {
        id: item.id,
        name: qualifiedName(media, item),
        ...(shared.status === "idle" ? {} : { sharer: shared.sharer }),
        interrupted: shared.status === "interrupted",
        mine: mine.has(item.id),
      };
    });
}

/** The slots somebody shares into now, interrupted ones included: Studio's reminder. */
export function activeShares(
  media: Table<Media> | undefined,
  live: Readonly<Record<string, MediaLive | undefined>>,
): ShareSlot[] {
  return shareSlots(media, live).filter((slot) => slot.sharer !== undefined);
}

/** What the share window's list says under a slot's name. */
export function slotStatus(slot: ShareSlot): string {
  if (slot.mine) return "This computer shares into it";
  if (slot.sharer === undefined) return "Nobody shares into it";
  return slot.interrupted
    ? `${slot.sharer} was sharing into it and lost its connection`
    : `${slot.sharer} shares into it; sharing takes its place`;
}
