import type { DocumentView } from "@difracta/client";
import type { Share } from "@difracta/core";
import type { ShareLive } from "@difracta/protocol";
import { Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { mediaTypeIcons } from "@/entities/media/media-icons";
import { useCommand } from "@/lib/client";
import { cn } from "@/lib/utils";
import { NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { shareLive } from "./share-slots";
import { describeShare, shareStatusTone } from "./share-status";

/**
 * The Screen Shares' rows in the Media section, in their order and
 * reorderable by drag, each with who shares into it from the live state.
 */
export function ShareRows({
  view,
  shares,
  live,
}: {
  readonly view: DocumentView;
  /** In navigator order. */
  readonly shares: readonly Share[];
  readonly live: Readonly<Record<string, ShareLive | undefined>>;
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  if (shares.length === 0) return null;
  return (
    <SortableList
      kind="share"
      listId="shares"
      ids={shares.map((share) => share.id)}
      selectedId={selection?.kind === "share" ? selection.id : undefined}
      onMove={(id, after) =>
        void command("entity.move", { table: "shares", id, after })
      }
    >
      {shares.map((share) => {
        const text = describeShare(shareLive(live[share.id]));
        return (
          <ContextMenu key={share.id}>
            <ContextMenuTrigger
              render={
                <SortableItem id={share.id}>
                  <NavigatorRow
                    id={share.id}
                    depth={1}
                    icon={mediaTypeIcons.live}
                    label={share.name}
                    selected={isSelected(selection, "share", share.id)}
                    onSelect={() => select({ kind: "share", id: share.id })}
                  >
                    {text.word === "interrupted" ? (
                      <NavigatorWarning
                        label={text.word}
                        explanation={text.explanation}
                      />
                    ) : (
                      <span
                        data-share-status={text.word}
                        className={cn(
                          "shrink-0 text-[0.625rem]",
                          shareStatusTone[text.word],
                        )}
                      >
                        {text.word}
                      </span>
                    )}
                  </NavigatorRow>
                </SortableItem>
              }
            />
            <ContextMenuContent>
              <ContextMenuItem
                variant="destructive"
                onClick={() => removeEntity("share", share.id)}
              >
                <Trash2 /> Remove
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </SortableList>
  );
}
