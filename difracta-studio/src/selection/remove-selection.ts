import type { Document } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useDocumentCommands } from "@/documents/document-commands";
import { entities, type EntityKind } from "@/entities";
import { showWarnings, useClient } from "@/lib/client";
import { neighbourRow, selectNavigatorRow } from "@/navigator/focus-row";
import { shortcuts } from "@/shortcuts";

import { useSelection, type Selection } from "./selection";

/** Whether the selection can be removed now, and if not, whether there is a reason to say. */
export type RemovableSelection =
  | { readonly state: "none" }
  | { readonly state: "refused"; readonly reason: string }
  | {
      readonly state: "ready";
      readonly kind: EntityKind;
      readonly id: string;
      readonly name: string;
    };

export function removableSelection(
  document: Document | undefined,
  selection: Selection | undefined,
): RemovableSelection {
  if (
    document === undefined ||
    selection === undefined ||
    selection.kind === "installation"
  )
    return { state: "none" };
  const { removal } = entities[selection.kind];
  const entity = removal.find(document, selection.id);
  if (entity === undefined) return { state: "none" };
  const reason = removal.refusal?.(document, selection.id);
  if (reason !== undefined) return { state: "refused", reason };
  return {
    state: "ready",
    kind: selection.kind,
    id: selection.id,
    name: entity.name,
  };
}

/**
 * Remove for the selection: Edit ▸ Remove and the Delete key. It runs the
 * kind's own remove command without asking, since Ctrl+Z brings it back, says
 * so in a quiet toast, and selects the row that was next to it. A refusal,
 * such as the active Scene's, is said instead.
 */
export function useRemoveSelection(): {
  readonly removable: boolean;
  readonly remove: () => void;
} {
  const client = useClient();
  const { view } = useDocumentCommands();
  const { selection, select } = useSelection();
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
    if (view === undefined) return;
    const target = removableSelection(view.get(), selection);
    if (target.state === "refused") {
      toast.message(target.reason);
      return;
    }
    if (target.state !== "ready") return;
    const { removal } = entities[target.kind];
    const neighbour = neighbourRow(target.id);
    client
      .command<CommandResult>(
        view.documentId,
        removal.command,
        removal.payload(target.id),
      )
      .then(
        (result) => {
          toast.message(
            `Removed ${removal.noun} “${target.name}”. ${shortcuts.undo.label} undoes.`,
          );
          showWarnings(result.warnings ?? []);
          if (neighbour === undefined) select(undefined);
          else selectNavigatorRow(neighbour);
        },
        (failure: unknown) => {
          toast.error(
            failure instanceof Error ? failure.message : String(failure),
          );
        },
      );
  }, [client, view, selection, select]);
  return { removable, remove };
}
