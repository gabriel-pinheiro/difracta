import type { DocumentView } from "@difracta/client";
import type { Layer } from "@difracta/core";

import { FieldRow } from "@/inspector/fields/field-row";
import { useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

/**
 * The Visual Layer a Filter Layer sits inside, as an "In" row under the
 * Filter's name; the name selects that Layer. Nothing for a Filter whose
 * parent is a Group or the Scene's root, which treats the frame.
 */
export function LayerHolderRow({
  view,
  parentId,
}: {
  readonly view: DocumentView;
  readonly parentId: string;
}) {
  const { select } = useSelection();
  const parent = useDocumentPath<Layer>(view, ["layers", parentId]);
  if (parent?.kind !== "visual") return null;
  return (
    <FieldRow label="In" description="The Visual Layer this Filter treats">
      <button
        type="button"
        className="truncate text-left text-xs hover:text-foreground"
        title={`Select ${parent.name}`}
        onClick={() => select({ kind: "layer", id: parent.id })}
      >
        {parent.name}
      </button>
    </FieldRow>
  );
}
