import type { DocumentView } from "@difracta/client";
import {
  generateId,
  orderedEntries,
  type Mask,
  type Output,
  type Path,
  type Surface,
  type Table,
} from "@difracta/core";
import { Box, Spline, SquareDashed, Trash2 } from "lucide-react";
import { useState } from "react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChildRows } from "@/entities/surface/child-rows";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { removeFocusingNeighbour } from "@/navigator/focus-row";
import { NavigatorEmptyRow, NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

/** Navigator section listing the Surfaces; each row names the Output it renders through. */
export function SurfacesSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const [naming, setNaming] = useState<
    | { kind: "surface" }
    | { kind: "mask" | "path"; surface: Surface }
    | undefined
  >(undefined);
  const ordered = orderedEntries(surfaces);

  function create(name: string): void {
    if (naming?.kind === "mask" || naming?.kind === "path") {
      const kind = naming.kind;
      const id = generateId(kind);
      const surfaceId = naming.surface.id;
      void command(`${kind}.create`, { id, surfaceId, name }).then(() => {
        setExpanded("surface", surfaceId, true);
        select({ kind, id });
      });
      return;
    }
    const id = generateId("surface");
    void command("surface.create", { id, name }).then(() => {
      select({ kind: "surface", id });
    });
  }
  const maskCount = (surface: Surface): number =>
    Object.values(masks).filter((mask) => mask.surfaceId === surface.id).length;
  const pathCount = (surface: Surface): number =>
    Object.values(paths).filter((path) => path.surfaceId === surface.id).length;

  return (
    <>
      <NavigatorSection
        storageKey="surface"
        label="Surfaces"
        empty={ordered.length === 0 ? "No Surfaces yet." : undefined}
        onCreate={() => setNaming({ kind: "surface" })}
      >
        <SortableList
          kind="surface"
          ids={ordered.map((surface) => surface.id)}
          selectedId={selection?.kind === "surface" ? selection.id : undefined}
          onMove={(id, after) =>
            void command("entity.move", { table: "surfaces", id, after })
          }
        >
          {ordered.map((surface) => {
            const output =
              surface.output === null ? undefined : outputs[surface.output];
            const expanded = isExpanded("surface", surface.id);
            return (
              <SortableItem key={surface.id} id={surface.id}>
                <ContextMenu>
                  <ContextMenuTrigger>
                    <NavigatorRow
                      id={surface.id}
                      icon={Box}
                      label={surface.name}
                      selected={isSelected(selection, "surface", surface.id)}
                      expanded={expanded}
                      onToggle={(next) =>
                        setExpanded("surface", surface.id, next)
                      }
                      onSelect={() =>
                        select({ kind: "surface", id: surface.id })
                      }
                      createItems={[
                        {
                          label: "Mask…",
                          icon: SquareDashed,
                          onSelect: () => setNaming({ kind: "mask", surface }),
                        },
                        {
                          label: "Path…",
                          icon: Spline,
                          onSelect: () => setNaming({ kind: "path", surface }),
                        },
                      ]}
                    >
                      {output === undefined ? (
                        <NavigatorWarning
                          label="No Output"
                          explanation="This Surface has no Output, so nothing projects it. Pick one in the inspector."
                        />
                      ) : (
                        <span className="truncate text-[0.625rem] text-muted-foreground">
                          {output.name}
                        </span>
                      )}
                    </NavigatorRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => setNaming({ kind: "mask", surface })}
                    >
                      <SquareDashed /> Add Mask…
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => setNaming({ kind: "path", surface })}
                    >
                      <Spline /> Add Path…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() =>
                        removeFocusingNeighbour(surface.id, () =>
                          command("surface.remove", { surfaceId: surface.id }),
                        )
                      }
                    >
                      <Trash2 /> Remove
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {expanded &&
                  (maskCount(surface) + pathCount(surface) === 0 ? (
                    <NavigatorEmptyRow depth={2}>
                      No Masks or Paths
                    </NavigatorEmptyRow>
                  ) : (
                    <ChildRows view={view} surfaceId={surface.id} />
                  ))}
              </SortableItem>
            );
          })}
        </SortableList>
      </NavigatorSection>
      <NameDialog
        request={
          naming === undefined
            ? undefined
            : naming.kind === "surface"
              ? {
                  title: "New Surface",
                  label: "Name",
                  initial: `Surface ${String(ordered.length + 1)}`,
                  submitLabel: "Create",
                  onSubmit: create,
                }
              : naming.kind === "mask"
                ? {
                    title: `New Mask on ${naming.surface.name}`,
                    label: "Name",
                    initial: `Mask ${String(maskCount(naming.surface) + 1)}`,
                    submitLabel: "Create",
                    onSubmit: create,
                  }
                : {
                    title: `New Path on ${naming.surface.name}`,
                    label: "Name",
                    initial: `Path ${String(pathCount(naming.surface) + 1)}`,
                    submitLabel: "Create",
                    onSubmit: create,
                  }
        }
        onClose={() => setNaming(undefined)}
      />
    </>
  );
}
