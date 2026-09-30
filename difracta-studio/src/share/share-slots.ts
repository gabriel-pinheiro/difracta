import {
  flattenMedia,
  qualifiedName,
  type Media,
  type Table,
} from "@difracta/core";
import type { MediaLive } from "@difracta/protocol";

/** A Screen Share of the open Installation, as the share window offers it. */
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

/**
 * The Installation's Screen Shares in navigator order, each with who shares
 * into it according to the live state. A slot somebody shares into is
 * offered like any other: a second Sharer takes the first one's place.
 */
export function shareSlots(
  media: Table<Media> | undefined,
  live: Readonly<Record<string, MediaLive>>,
  mine: ReadonlySet<string>,
): ShareSlot[] {
  if (media === undefined) return [];
  return flattenMedia(media)
    .filter((item) => item.kind === "share")
    .map((item) => {
      const entry = live[item.id];
      const shared =
        entry !== undefined && "sharer" in entry ? entry : undefined;
      return {
        id: item.id,
        name: qualifiedName(media, item),
        ...(shared === undefined ? {} : { sharer: shared.sharer }),
        interrupted: shared?.status === "interrupted",
        mine: mine.has(item.id),
      };
    });
}

/** What the list says under a slot's name. */
export function slotStatus(slot: ShareSlot): string {
  if (slot.mine) return "This computer shares into it";
  if (slot.sharer === undefined) return "Nobody shares into it";
  return slot.interrupted
    ? `${slot.sharer} was sharing into it and lost its connection`
    : `${slot.sharer} shares into it; sharing takes its place`;
}
