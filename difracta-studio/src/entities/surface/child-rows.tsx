import type { DocumentView } from "@difracta/client";
import {
  surfaceChildren,
  type Mask,
  type Path,
  type Region,
  type SurfaceChild,
  type SurfaceChildTable,
  type Table,
} from "@difracta/core";
import {
  RectangleHorizontal,
  Spline,
  SquareDashed,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { EntityKind } from "@/entities";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

/** How each kind of Surface child is drawn as a row: its selection kind and icon. */
export const childKinds: Record<
  SurfaceChildTable,
  { readonly kind: EntityKind; readonly icon: LucideIcon }
> = {
  regions: { kind: "region", icon: RectangleHorizontal },
  masks: { kind: "mask", icon: SquareDashed },
  paths: { kind: "path", icon: Spline },
};

/** The small note after a child's name: a Mask that excludes, a Path left open. */
export function childBadge(child: SurfaceChild): string | undefined {
  if (child.table === "masks" && child.entity.mode === "exclude")
    return "exclude";
  if (child.table === "paths" && !child.entity.closed) return "open";
  return undefined;
}

/**
 * The Regions, Masks and Paths of one Surface as child rows in their shared
 * order, reorderable among each other; render only when there are some.
 * The order is organizational: Masks still apply in their own sequence
 * among Masks.
 */
export function ChildRows({
  view,
  surfaceId,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const children = surfaceChildren({ regions, masks, paths }, surfaceId);
  const tableOf = (id: string) =>
    children.find((child) => child.entity.id === id)?.table ?? "masks";
  const selectedChild = children.find(
    (child) =>
      selection?.kind === childKinds[child.table].kind &&
      selection.id === child.entity.id,
  );
  return (
    <SortableList
      kind={`surface-child:${surfaceId}`}
      ids={children.map((child) => child.entity.id)}
      selectedId={selectedChild?.entity.id}
      onMove={(id, after) =>
        void command("entity.move", { table: tableOf(id), id, after })
      }
    >
      {children.map((child) => {
        const { kind, icon } = childKinds[child.table];
        const badge = childBadge(child);
        return (
          <SortableItem key={child.entity.id} id={child.entity.id}>
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  id={child.entity.id}
                  icon={icon}
                  depth={2}
                  label={child.entity.name}
                  selected={isSelected(selection, kind, child.entity.id)}
                  onSelect={() => select({ kind, id: child.entity.id })}
                >
                  {badge !== undefined && (
                    <span className="text-[0.625rem] text-muted-foreground">
                      {badge}
                    </span>
                  )}
                </NavigatorRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => removeEntity(kind, child.entity.id)}
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </SortableItem>
        );
      })}
    </SortableList>
  );
}
