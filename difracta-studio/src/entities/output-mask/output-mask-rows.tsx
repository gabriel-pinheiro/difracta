import type { DocumentView } from "@difracta/client";
import {
  generateId,
  orderedEntries,
  type Output,
  type OutputMask,
  type Table,
} from "@difracta/core";
import { SquareDashed, Trash2 } from "lucide-react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

/** The Output Masks of one Output, in their order. */
export function outputMasksOf(
  masks: Table<OutputMask>,
  outputId: string,
): readonly OutputMask[] {
  return orderedEntries(masks).filter((mask) => mask.outputId === outputId);
}

/**
 * The Output Masks of one Output as child rows in their order, reorderable
 * among each other, which is the order they apply in; render only when
 * there are some. An exclude mask carries a note after its name.
 */
export function OutputMaskRows({
  view,
  outputId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  const masks = outputMasksOf(
    useDocumentPath<Table<OutputMask>>(view, ["outputMasks"]) ?? {},
    outputId,
  );
  return (
    <SortableList
      kind={`output-mask:${outputId}`}
      ids={masks.map((mask) => mask.id)}
      selectedId={selection?.kind === "outputMask" ? selection.id : undefined}
      onMove={(id, after) =>
        void command("entity.move", { table: "outputMasks", id, after })
      }
    >
      {masks.map((mask) => (
        <SortableItem key={mask.id} id={mask.id}>
          <ContextMenu>
            <ContextMenuTrigger>
              <NavigatorRow
                id={mask.id}
                icon={SquareDashed}
                depth={2}
                label={mask.name}
                selected={isSelected(selection, "outputMask", mask.id)}
                onSelect={() => select({ kind: "outputMask", id: mask.id })}
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
                onClick={() => removeEntity("outputMask", mask.id)}
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

/** Asks for a name, creates an Output Mask on `output` and selects it. */
export function NewOutputMaskDialog({
  view,
  output,
  onClose,
}: {
  readonly view: DocumentView;
  /** The Output to add to; undefined keeps the dialog closed. */
  readonly output: Output | undefined;
  readonly onClose: () => void;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const masks = useDocumentPath<Table<OutputMask>>(view, ["outputMasks"]) ?? {};
  const count =
    output === undefined ? 0 : outputMasksOf(masks, output.id).length;
  return (
    <NameDialog
      request={
        output === undefined
          ? undefined
          : {
              title: `New Output Mask on ${output.name}`,
              label: "Name",
              initial: `Mask ${String(count + 1)}`,
              submitLabel: "Create",
              onSubmit: (name) => {
                const id = generateId("outputMask");
                void command("output-mask.create", {
                  id,
                  outputId: output.id,
                  name,
                }).then(() => {
                  select({ kind: "outputMask", id });
                });
              },
            }
      }
      onClose={onClose}
    />
  );
}
