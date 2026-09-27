import type { DocumentView } from "@difracta/client";
import { useEffect, useRef } from "react";

import { entities } from "@/entities";
import { useSelection } from "@/selection/selection";

import { ancestorRows, type RowRef } from "./ancestor-rows";
import { useExpansion } from "./expansion";
import { rowButton } from "./focus-row";

/**
 * Makes the navigator follow the selection: when it changes to an entity,
 * wherever that was chosen (a Link's pill, an inspector's list, a create),
 * every row above that entity's row opens and the row scrolls into view,
 * staying put when it already shows. The rows stay open as if opened by
 * hand, and one closed afterwards stays closed until the selection moves
 * again. Keyboard focus stays where it is. Renders nothing.
 */
export function RevealSelection({ view }: { readonly view: DocumentView }) {
  const { selection } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const kind = selection?.kind;
  const id =
    selection === undefined || selection.kind === "installation"
      ? undefined
      : selection.id;
  /** The selection last acted on, so only a change of it reveals. */
  const seen = useRef<string | undefined>(undefined);
  /** The row still to scroll to, then the rows above it, nearest first. */
  const pending = useRef<readonly RowRef[] | undefined>(undefined);

  useEffect(() => {
    const key =
      kind === undefined || id === undefined ? undefined : `${kind}:${id}`;
    if (key !== seen.current) {
      seen.current = key;
      pending.current = undefined;
      const document = view.get();
      if (
        kind !== undefined &&
        kind !== "installation" &&
        id !== undefined &&
        document !== undefined
      ) {
        const above = ancestorRows(
          document,
          { kind, id },
          (parentKind) => entities[parentKind].parent,
        );
        for (const parent of above) setExpanded(parent.kind, parent.id, true);
        pending.current = [{ kind, id }, ...above];
      }
    }
    const rows = pending.current;
    if (rows === undefined) return;
    // Opening a row renders again with a new `isExpanded`; the scroll waits
    // for that commit, where the rows it opened are mounted.
    const [, ...above] = rows;
    if (!above.every((parent) => isExpanded(parent.kind, parent.id))) return;
    pending.current = undefined;
    for (const candidate of rows) {
      const button = rowButton(candidate.id);
      if (button === null) continue;
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
  }, [kind, id, view, isExpanded, setExpanded]);

  return null;
}
