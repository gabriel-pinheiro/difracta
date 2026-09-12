import type { DocumentView } from "@difracta/client";
import {
  surfaceChildren,
  type Mask,
  type Path,
  type Table,
} from "@difracta/core";
import { Spline, SquareDashed, Trash2 } from "lucide-react";

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

/**
 * The Masks and Paths of one Surface as child rows in their shared order,
 * reorderable among each other; render only when there are some. The order
 * is organizational: Masks still apply in their own sequence among Masks.
 */
export function ChildRows({
  view,
  surfaceId,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
}) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const children = surfaceChildren({ masks, paths }, surfaceId);
  const tableOf = (id: string) =>
    children.find((child) => child.entity.id === id)?.table ?? "masks";
  return (
    <SortableList
      kind={`surface-child:${surfaceId}`}
      ids={children.map((child) => child.entity.id)}
      selectedId={
        selection?.kind === "mask" || selection?.kind === "path"
          ? selection.id
          : undefined
      }
      onMove={(id, after) =>
        void command("entity.move", { table: tableOf(id), id, after })
      }
    >
      {children.map((child) =>
        child.table === "masks" ? (
          <SortableItem key={child.entity.id} id={child.entity.id}>
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  icon={SquareDashed}
                  depth={2}
                  label={child.entity.name}
                  selected={isSelected(selection, "mask", child.entity.id)}
                  onSelect={() => select({ kind: "mask", id: child.entity.id })}
                >
                  {child.entity.mode === "exclude" && (
                    <span className="text-[0.625rem] text-muted-foreground">
                      exclude
                    </span>
                  )}
                </NavigatorRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() =>
                    void command("mask.remove", { maskId: child.entity.id })
                  }
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </SortableItem>
        ) : (
          <SortableItem key={child.entity.id} id={child.entity.id}>
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  icon={Spline}
                  depth={2}
                  label={child.entity.name}
                  selected={isSelected(selection, "path", child.entity.id)}
                  onSelect={() => select({ kind: "path", id: child.entity.id })}
                >
                  {!child.entity.closed && (
                    <span className="text-[0.625rem] text-muted-foreground">
                      open
                    </span>
                  )}
                </NavigatorRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() =>
                    void command("path.remove", { pathId: child.entity.id })
                  }
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </SortableItem>
        ),
      )}
    </SortableList>
  );
}

export function generateMaskId(): string {
  return `mask_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function generatePathId(): string {
  return `path_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
