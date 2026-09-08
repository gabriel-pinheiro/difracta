import type { DocumentView } from "@difracta/client";
import { orderedEntries, type Mask, type Table } from "@difracta/core";
import { SquareDashed, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

/** The Masks of one Surface as child rows, reorderable among themselves; render only when there are some. */
export function MaskRows({
  view,
  surfaceId,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
}) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const ordered = orderedEntries(masks).filter(
    (mask) => mask.surfaceId === surfaceId,
  );
  return (
    <SortableList
      kind={`mask:${surfaceId}`}
      ids={ordered.map((mask) => mask.id)}
      selectedId={selection?.kind === "mask" ? selection.id : undefined}
      onMove={(id, after) =>
        void command("entity.move", { table: "masks", id, after })
      }
    >
      {ordered.map((mask) => (
        <SortableItem key={mask.id} id={mask.id}>
          <ContextMenu>
            <ContextMenuTrigger>
              <NavigatorRow
                icon={SquareDashed}
                depth={2}
                label={mask.name}
                selected={isSelected(selection, "mask", mask.id)}
                onSelect={() => select({ kind: "mask", id: mask.id })}
              >
                {mask.mode === "exclude" && (
                  <span className="text-[0.625rem] text-muted-foreground">
                    exclude
                  </span>
                )}
              </NavigatorRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                variant="destructive"
                onClick={() => void command("mask.remove", { maskId: mask.id })}
              >
                <Trash2 /> Remove
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </SortableItem>
      ))}
    </SortableList>
  );
}

export function generateMaskId(): string {
  return `mask_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
