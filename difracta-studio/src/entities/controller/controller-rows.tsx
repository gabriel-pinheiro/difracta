import type { DocumentView } from "@difracta/client";
import { childControllers, type Controller, type Table } from "@difracta/core";
import { Copy, Trash2, Ungroup } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import {
  NavigatorEmptyRow,
  NavigatorRow,
  type CreateItem,
} from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { controllerIcons } from "./controller-icons";

/** The Controllers under the root or one Group as rows, with their live value at the right. */
export function ControllerRows({
  view,
  parentId,
  depth,
  createItems,
}: {
  readonly view: DocumentView;
  readonly parentId: string | null;
  readonly depth: number;
  readonly createItems: (parentId: string | null) => readonly CreateItem[];
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const controllers =
    useDocumentPath<Table<Controller>>(view, ["controllers"]) ?? {};
  const rows = childControllers(controllers, parentId);
  const moveInto = (controllerId: string, target: Controller): void =>
    void command("controller.move", {
      controllerId,
      parentId: target.id,
      after: null,
    });

  if (rows.length === 0)
    return (
      <NavigatorEmptyRow depth={depth}>
        {parentId === null ? "No Controllers yet." : "Empty Group"}
      </NavigatorEmptyRow>
    );
  return (
    <SortableList
      kind="controller"
      listId={`controller:${parentId ?? ""}`}
      ids={rows.map((controller) => controller.id)}
      selectedId={selection?.kind === "controller" ? selection.id : undefined}
      onMove={(controllerId, after) =>
        void command("controller.move", { controllerId, parentId, after })
      }
    >
      {rows.map((controller) => {
        const group = controller.kind === "group";
        const expanded = group && isExpanded("controller", controller.id);
        return (
          <SortableItem
            key={controller.id}
            id={controller.id}
            inside={
              group
                ? {
                    kinds: ["controller"],
                    onDrop: (id) => moveInto(id, controller),
                  }
                : undefined
            }
          >
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  id={controller.id}
                  icon={controllerIcons[controller.kind]}
                  label={controller.name}
                  depth={depth}
                  selected={isSelected(selection, "controller", controller.id)}
                  expanded={expanded}
                  onToggle={
                    group
                      ? (next) => setExpanded("controller", controller.id, next)
                      : undefined
                  }
                  onSelect={() =>
                    select({ kind: "controller", id: controller.id })
                  }
                  createItems={group ? createItems(controller.id) : undefined}
                >
                  <ValueReadout controller={controller} />
                </NavigatorRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {group && (
                  <>
                    {createItems(controller.id).map((item) => (
                      <ContextMenuItem key={item.label} onClick={item.onSelect}>
                        <item.icon /> Add {item.label}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuSeparator />
                  </>
                )}
                <ContextMenuItem
                  onClick={() =>
                    void command("controller.duplicate", {
                      controllerId: controller.id,
                    })
                  }
                >
                  <Copy /> Duplicate
                </ContextMenuItem>
                {group && (
                  <ContextMenuItem
                    onClick={() =>
                      void command("controller.ungroup", {
                        controllerId: controller.id,
                      })
                    }
                  >
                    <Ungroup /> Ungroup
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => removeEntity("controller", controller.id)}
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {expanded && (
              <ControllerRows
                view={view}
                parentId={controller.id}
                depth={depth + 1}
                createItems={createItems}
              />
            )}
          </SortableItem>
        );
      })}
    </SortableList>
  );
}

/** A Number Controller's percent or a Color Controller's swatch, live. */
function ValueReadout({ controller }: { readonly controller: Controller }) {
  if (controller.kind === "number")
    return (
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
        {Math.round(controller.value * 100)}%
      </span>
    );
  if (controller.kind === "color")
    return (
      <span
        className="size-3 shrink-0 rounded-[3px] border border-input"
        title={`${controller.name} color`}
        style={{ background: rgba(controller.value) }}
      />
    );
  return null;
}

function rgba(color: readonly number[]): string {
  const [r = 0, g = 0, b = 0, a = 1] = color;
  return `rgba(${String(Math.round(r * 255))}, ${String(Math.round(g * 255))}, ${String(Math.round(b * 255))}, ${String(a)})`;
}
