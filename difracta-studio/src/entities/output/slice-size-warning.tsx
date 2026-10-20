import type { DocumentView } from "@difracta/client";
import { isSliced, type Output, type Slice, type Table } from "@difracta/core";
import type { OutputTelemetry } from "@difracta/protocol";

import { Button } from "@/components/ui/button";
import { useCommand, useDocumentPath } from "@/lib/client";

import { formatSize } from "./display-size";
import { sliceOverlapWarning, sliceSizeMismatch } from "./output-warning";

/**
 * On a sliced Output's card: its Output Session draws at a size other than
 * the Display Frame its Slices were drawn for, so the map is scaled to fit
 * from the top-left corner, with the reported size one click away.
 */
export function SliceSizeWarning({
  view,
  output,
  telemetry,
}: {
  readonly view: DocumentView;
  readonly output: Output;
  readonly telemetry: OutputTelemetry | null | undefined;
}) {
  const command = useCommand(view);
  const sliced = isSliced(
    useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {},
    output.id,
  );
  const mismatch = sliceSizeMismatch(output, sliced, telemetry);
  if (mismatch === undefined || output.displaySize === null) return null;
  return (
    <div className="flex items-center gap-2 rounded-sm bg-amber-500/15 px-2 py-1.5 text-[0.6875rem] text-amber-300">
      <span className="min-w-0 flex-1">
        Draws {formatSize(output.displaySize)} Slices on {formatSize(mismatch)}:
        the map is scaled to fit.
      </span>
      <Button
        size="xs"
        variant="outline"
        onClick={(event) => {
          event.stopPropagation();
          void command("output.update", {
            outputId: output.id,
            displaySize: mismatch,
          });
        }}
      >
        Use {formatSize(mismatch)}
      </Button>
    </div>
  );
}

/**
 * On an Output's card while two of its Slices overlap in the Display
 * Frame: the last place to catch it before the show.
 */
export function SliceOverlapWarning({
  view,
  outputId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
}) {
  const warning = sliceOverlapWarning(
    useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {},
    outputId,
  );
  if (warning === undefined) return null;
  return (
    <div className="rounded-sm bg-destructive/15 px-2 py-1.5 text-[0.6875rem] text-destructive">
      {warning}
    </div>
  );
}
