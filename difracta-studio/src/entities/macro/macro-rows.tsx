import type { DocumentView } from "@difracta/client";
import { childMacros, type Macro, type Table } from "@difracta/core";
import { Copy, Play, Trash2, Ungroup } from "lucide-react";

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
  RowAction,
  type CreateItem,
} from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { macroIcons } from "./macro-icons";
import { useRunMacro } from "./run-macro";

/** The Macros under the root or one Group as rows, each with its action count and a Run button. */
export function MacroRows({
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
  const run = useRunMacro(view);
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const macros = useDocumentPath<Table<Macro>>(view, ["macros"]) ?? {};
  const rows = childMacros(macros, parentId);
  const moveInto = (macroId: string, target: Macro): void =>
    void command("macro.move", { macroId, parentId: target.id, after: null });

  if (rows.length === 0)
    return (
      <NavigatorEmptyRow depth={depth}>
        {parentId === null ? "No Macros yet." : "Empty Group"}
      </NavigatorEmptyRow>
    );
  return (
    <SortableList
      kind="macro"
      listId={`macro:${parentId ?? ""}`}
      ids={rows.map((macro) => macro.id)}
      selectedId={selection?.kind === "macro" ? selection.id : undefined}
      onMove={(macroId, after) =>
        void command("macro.move", { macroId, parentId, after })
      }
    >
      {rows.map((macro) => {
        const group = macro.kind === "group";
        const expanded = group && isExpanded("macro", macro.id);
        return (
          <SortableItem
            key={macro.id}
            id={macro.id}
            inside={
              group
                ? { kinds: ["macro"], onDrop: (id) => moveInto(id, macro) }
                : undefined
            }
          >
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  id={macro.id}
                  icon={macroIcons[macro.kind]}
                  label={macro.name}
                  depth={depth}
                  selected={isSelected(selection, "macro", macro.id)}
                  expanded={expanded}
                  onToggle={
                    group
                      ? (next) => setExpanded("macro", macro.id, next)
                      : undefined
                  }
                  onSelect={() => select({ kind: "macro", id: macro.id })}
                  createItems={group ? createItems(macro.id) : undefined}
                  actions={
                    macro.kind === "macro" ? (
                      <RowAction
                        label={`Run ${macro.name}`}
                        onClick={() => run(macro)}
                      >
                        <Play className="size-3" />
                      </RowAction>
                    ) : undefined
                  }
                >
                  {macro.kind === "macro" && (
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
                      {macro.actions.length}
                    </span>
                  )}
                </NavigatorRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                {group && (
                  <>
                    {createItems(macro.id).map((item) => (
                      <ContextMenuItem key={item.label} onClick={item.onSelect}>
                        <item.icon /> Add {item.label}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuSeparator />
                  </>
                )}
                {macro.kind === "macro" && (
                  <ContextMenuItem onClick={() => run(macro)}>
                    <Play /> Run
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  onClick={() =>
                    void command("macro.duplicate", { macroId: macro.id })
                  }
                >
                  <Copy /> Duplicate
                </ContextMenuItem>
                {group && (
                  <ContextMenuItem
                    onClick={() =>
                      void command("macro.ungroup", { macroId: macro.id })
                    }
                  >
                    <Ungroup /> Ungroup
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => removeEntity("macro", macro.id)}
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {expanded && (
              <MacroRows
                view={view}
                parentId={macro.id}
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
