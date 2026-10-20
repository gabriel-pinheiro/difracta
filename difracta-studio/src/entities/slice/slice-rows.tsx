import type { DocumentView } from "@difracta/client";
import { outputSlices, type Slice, type Table } from "@difracta/core";
import { LayoutPanelTop, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { useSliceEditor } from "./slice-editor-state";

/** Rotation and scale after a Slice's name, when it has either. */
export function placementNote(slice: Slice): string {
  return [
    ...(slice.rotation === 0 ? [] : [`${String(slice.rotation)}°`]),
    ...(slice.scale === 1 ? [] : [`×${String(slice.scale)}`]),
  ].join(" ");
}

/** The Slices of one Output as child rows in their order; render only when there are some. */
export function SliceRows({
  view,
  outputId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const editor = useSliceEditor();
  const { selection, select } = useSelection();
  const slices = outputSlices(
    useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {},
    outputId,
  );
  return (
    <SortableList
      kind={`slice:${outputId}`}
      ids={slices.map((slice) => slice.id)}
      selectedId={selection?.kind === "slice" ? selection.id : undefined}
      onMove={(id, after) =>
        void command("entity.move", { table: "slices", id, after })
      }
    >
      {slices.map((slice) => (
        <SortableItem key={slice.id} id={slice.id}>
          <ContextMenu>
            <ContextMenuTrigger>
              <NavigatorRow
                id={slice.id}
                icon={LayoutPanelTop}
                depth={2}
                label={slice.name}
                selected={isSelected(selection, "slice", slice.id)}
                onSelect={() => select({ kind: "slice", id: slice.id })}
                onOpen={() => editor.open(outputId)}
              >
                <span className="font-mono text-[0.625rem] text-muted-foreground">
                  {placementNote(slice)}
                </span>
              </NavigatorRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => editor.open(outputId)}>
                <LayoutPanelTop /> Edit Slices
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => removeEntity("slice", slice.id)}
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
