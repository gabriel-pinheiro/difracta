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
  if (removal === undefined) return { state: "none" };
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
 * refusal, such as the active Scene's, is said instead; a kind whose
 * removal asks first, such as a Pack's, gets its question.
 */
export function useRemoveEntity(): (kind: EntityKind, id: string) => void {
  const client = useClient();
  const { view, confirm } = useDocumentCommands();
  const { select } = useSelection();
  return useCallback(
    (kind, id) => {
      if (view === undefined) return;
      const document = view.get();
      const target = removableEntity(document, kind, id);
      if (target.state === "refused") {
        toast.message(target.reason);
        return;
      }
      if (target.state !== "ready") return;
      const { removal } = entities[kind];
      if (removal === undefined) return;
      // Named apart, so `remove` below, a hoisted function, sees it defined.
      const action = removal;
      const question =
        document === undefined ? undefined : removal.confirm?.(document, id);
      if (question !== undefined) {
        confirm({
          title: `Remove “${target.name}”?`,
          description: question,
          actionLabel: "Remove",
          onConfirm: () => remove(),
        });
        return;
      }
      remove();

      function remove(): void {
        if (view === undefined) return;
        const neighbour = neighbourRow(id);
        const header = sectionHeader(id);
        client
          .command<CommandResult>(
            view.documentId,
            action.command,
            action.payload(id),
          )
          .then(
            (result) => {
              if (target.state === "ready")
                toast.message(
                  `Removed ${action.noun} “${target.name}”. ${shortcuts.undo.label} undoes.`,
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
      }
    },
    [client, view, confirm, select],
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
