import type { Document } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useDocumentCommands } from "@/documents/document-commands";
import { entities, type EntityKind } from "@/entities";
import { showWarnings, useClient } from "@/lib/client";
import {
  neighbourRow,
  sectionHeader,
  selectNavigatorRow,
} from "@/navigator/focus-row";
import { shortcuts } from "@/shortcuts";

import { useSelection, type Selection } from "./selection";

/** Whether an entity can be removed now, and if not, whether there is a reason to say. */
export type Removable =
  | { readonly state: "none" }
  | { readonly state: "refused"; readonly reason: string }
  | {
      readonly state: "ready";
      readonly kind: EntityKind;
      readonly id: string;
      readonly name: string;
    };

export function removableEntity(
  document: Document | undefined,
  kind: EntityKind,
  id: string,
): Removable {
  if (document === undefined) return { state: "none" };
  const { removal } = entities[kind];
  const entity = removal.find(document, id);
  if (entity === undefined) return { state: "none" };
  const reason = removal.refusal?.(document, id);
  if (reason !== undefined) return { state: "refused", reason };
  return { state: "ready", kind, id, name: entity.name };
}

export function removableSelection(
  document: Document | undefined,
  selection: Selection | undefined,
): Removable {
  if (selection === undefined || selection.kind === "installation")
    return { state: "none" };
  return removableEntity(document, selection.kind, selection.id);
}

/**
 * Remove for one entity: Edit ▸ Remove, the Delete key and every navigator
 * row's context menu. It runs the kind's own remove command without asking,
 * since Ctrl+Z brings it back, says so in a quiet toast, and selects the row
 * that was next to it, or with none left, focuses the section's header. A
 * refusal, such as the active Scene's, is said instead.
 */
export function useRemoveEntity(): (kind: EntityKind, id: string) => void {
  const client = useClient();
  const { view } = useDocumentCommands();
  const { select } = useSelection();
  return useCallback(
    (kind, id) => {
      if (view === undefined) return;
      const target = removableEntity(view.get(), kind, id);
      if (target.state === "refused") {
        toast.message(target.reason);
        return;
      }
      if (target.state !== "ready") return;
      const { removal } = entities[kind];
      const neighbour = neighbourRow(id);
      const header = sectionHeader(id);
      client
        .command<CommandResult>(
          view.documentId,
          removal.command,
          removal.payload(id),
        )
        .then(
          (result) => {
            toast.message(
              `Removed ${removal.noun} “${target.name}”. ${shortcuts.undo.label} undoes.`,
            );
            showWarnings(result.warnings ?? []);
            if (neighbour !== undefined) {
              selectNavigatorRow(neighbour);
              return;
            }
            select(undefined);
            requestAnimationFrame(() => header?.focus());
          },
          (failure: unknown) => {
            toast.error(
              failure instanceof Error ? failure.message : String(failure),
            );
          },
        );
    },
    [client, view, select],
  );
}

/** Remove for the selection, the Delete key's and Edit ▸ Remove's. */
export function useRemoveSelection(): {
  readonly removable: boolean;
  readonly remove: () => void;
} {
  const { view } = useDocumentCommands();
  const { selection } = useSelection();
  const removeEntity = useRemoveEntity();
  const subscribe = useCallback(
    (listener: () => void) =>
      view?.revision.subscribe(() => listener()) ?? (() => undefined),
    [view],
  );
  const removable = useSyncExternalStore(
    subscribe,
    () => removableSelection(view?.get(), selection).state === "ready",
  );
  const remove = useCallback(() => {
    if (selection === undefined || selection.kind === "installation") return;
    removeEntity(selection.kind, selection.id);
  }, [selection, removeEntity]);
  return { removable, remove };
}
