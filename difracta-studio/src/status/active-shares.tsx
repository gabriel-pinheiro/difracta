import type { DocumentView } from "@difracta/client";
import type { Share, Table } from "@difracta/core";
import type { LiveState } from "@difracta/protocol";

import { mediaTypeIcons } from "@/entities/media/media-icons";
import { activeShares } from "@/entities/share/share-slots";
import { shareStatusTone } from "@/entities/share/share-status";
import { useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSelection } from "@/selection/selection";

const ShareIcon = mediaTypeIcons.live;

/**
 * Every Screen Share somebody shares into, with who: a reminder that a
 * screen is on its way to the Outputs, in every Studio, whoever shares.
 * Clicking one selects its slot, where Stop is.
 */
export function ActiveShares({ view }: { readonly view: DocumentView }) {
  const { select } = useSelection();
  const table = useDocumentPath<Table<Share>>(view, ["shares"]);
  const live = useDocumentPath<LiveState["shares"]>(view, ["live", "shares"]);
  const shares = activeShares(table, live ?? {});
  return shares.map((share) => (
    <button
      key={share.id}
      type="button"
      data-active-share={share.id}
      title={
        share.interrupted
          ? `${share.sharer ?? ""} was sharing into “${share.name}” and lost its connection`
          : `${share.sharer ?? ""} shares into “${share.name}”`
      }
      className={cn(
        "flex min-w-0 shrink items-center gap-1 rounded-sm px-1.5 hover:bg-accent",
        shareStatusTone[share.interrupted ? "interrupted" : "live"],
      )}
      onClick={() => select({ kind: "share", id: share.id })}
    >
      <ShareIcon className="size-3 shrink-0" />
      <span className="truncate">
        {share.name} · {share.sharer}
      </span>
    </button>
  ));
}
