import type { DocumentView } from "@difracta/client";
import {
  orderedEntries,
  type Mask,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { Box, SquareDashed, Trash2 } from "lucide-react";
import { useState } from "react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { generateMaskId, MaskRows } from "@/entities/mask/mask-rows";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { NavigatorEmptyRow, NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

function generateSurfaceId(): string {
  return `surface_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** Navigator section listing the Surfaces; each row names the Output it renders through. */
export function SurfacesSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const [naming, setNaming] = useState<
    { kind: "surface" } | { kind: "mask"; surface: Surface } | undefined
  >(undefined);
  const ordered = orderedEntries(surfaces);

  function create(name: string): void {
    if (naming?.kind === "mask") {
      const id = generateMaskId();
      const surfaceId = naming.surface.id;
      void command("mask.create", { id, surfaceId, name }).then(() => {
        setExpanded("surface", surfaceId, true);
        select({ kind: "mask", id });
      });
      return;
    }
    const id = generateSurfaceId();
    void command("surface.create", { id, name }).then(() => {
      select({ kind: "surface", id });
    });
  }
  const maskCount = (surface: Surface): number =>
    Object.values(masks).filter((mask) => mask.surfaceId === surface.id).length;

  return (
    <>
      <NavigatorSection
        storageKey="surface"
        label="Surfaces"
        empty={
          ordered.length === 0 ? "No Surfaces. Press + to add one." : undefined
        }
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
                      onCreate={() => setNaming({ kind: "mask", surface })}
                    >
                      <span
                        className={
                          output === undefined
                            ? "truncate text-[0.625rem] text-muted-foreground/60 italic"
                            : "truncate text-[0.625rem] text-muted-foreground"
                        }
                      >
                        {output?.name ?? "no Output"}
                      </span>
                    </NavigatorRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={() => setNaming({ kind: "mask", surface })}
                    >
                      <SquareDashed /> Add Mask…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() =>
                        void command("surface.remove", {
                          surfaceId: surface.id,
                        })
                      }
                    >
                      <Trash2 /> Remove
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {expanded &&
                  (maskCount(surface) === 0 ? (
                    <NavigatorEmptyRow depth={2}>No Masks</NavigatorEmptyRow>
                  ) : (
                    <MaskRows view={view} surfaceId={surface.id} />
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
              : {
                  title: `New Mask on ${naming.surface.name}`,
                  label: "Name",
                  initial: `Mask ${String(maskCount(naming.surface) + 1)}`,
                  submitLabel: "Create",
                  onSubmit: create,
                }
        }
        onClose={() => setNaming(undefined)}
      />
    </>
  );
}
