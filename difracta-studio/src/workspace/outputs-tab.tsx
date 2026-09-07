import type { DocumentView } from "@difracta/client";
import { orderedEntries, type Output, type Table } from "@difracta/core";

import { OutputCard } from "@/entities/output/output-card";
import { useDocumentPath } from "@/lib/client";
import {
  deselectOnBackgroundClick,
  isSelected,
  useSelection,
} from "@/selection/selection";

/** Every Output of the Installation as a card; the selected one follows the navigator. */
export function OutputsTab({ view }: { readonly view: DocumentView }) {
  const { selection, select } = useSelection();
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const list = orderedEntries(outputs);
  if (list.length === 0) {
    return (
      <p className="p-3 text-muted-foreground">
        No Outputs yet. Add one from the navigator; each Output pairs with one
        display through its Output page.
      </p>
    );
  }
  return (
    <div
      className="grid min-h-full content-start gap-2 p-2"
      onClick={deselectOnBackgroundClick(select)}
    >
      {list.map((output) => (
        <OutputCard
          key={output.id}
          view={view}
          output={output}
          selected={isSelected(selection, "output", output.id)}
          onSelect={() => select({ kind: "output", id: output.id })}
        />
      ))}
    </div>
  );
}
