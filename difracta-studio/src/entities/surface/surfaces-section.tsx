import type { DocumentView } from "@difracta/client";
import {
  orderedEntries,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { Box, Trash2 } from "lucide-react";
import { useState } from "react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
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
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const [naming, setNaming] = useState(false);
  const ordered = orderedEntries(surfaces);

  function create(name: string): void {
    const id = generateSurfaceId();
    void command("surface.create", { id, name }).then(() => {
      select({ kind: "surface", id });
    });
  }

  return (
    <>
      <NavigatorSection
        storageKey="surface"
        label="Surfaces"
        empty={
          ordered.length === 0 ? "No Surfaces. Press + to add one." : undefined
        }
        onCreate={() => setNaming(true)}
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
            return (
              <SortableItem key={surface.id} id={surface.id}>
                <ContextMenu>
                  <ContextMenuTrigger>
                    <NavigatorRow
                      icon={Box}
                      label={surface.name}
                      selected={isSelected(selection, "surface", surface.id)}
                      onSelect={() =>
                        select({ kind: "surface", id: surface.id })
                      }
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
              </SortableItem>
            );
          })}
        </SortableList>
      </NavigatorSection>
      <NameDialog
        request={
          naming
            ? {
                title: "New Surface",
                label: "Name",
                initial: `Surface ${String(ordered.length + 1)}`,
                submitLabel: "Create",
                onSubmit: create,
              }
            : undefined
        }
        onClose={() => setNaming(false)}
      />
    </>
  );
}
