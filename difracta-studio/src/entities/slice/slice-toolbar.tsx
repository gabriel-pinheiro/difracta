import type { DocumentView } from "@difracta/client";
import {
  settings,
  type DisplaySize,
  type Output,
  type Slice,
} from "@difracta/core";
import { Grid2x2, Plus, RotateCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatSize,
  sameSize,
  type OfferedDisplaySize,
} from "@/entities/output/display-size";
import { NumberField } from "@/inspector/fields/number-field";
import { useCommand } from "@/lib/client";

/** What an offered Display size is called on its button. */
export function offeredLabel(offered: OfferedDisplaySize): string {
  switch (offered.source.kind) {
    case "display":
      return `Use ${offered.source.label}'s size (${formatSize(offered.size)})`;
    case "session":
      return `Use the Output page's size (${formatSize(offered.size)})`;
    case "fallback":
      return `Use ${formatSize(offered.size)}`;
  }
}

/**
 * The Slice editor's controls: New Slice, the Output's Display size, and
 * for the selected Slice a quarter turn and a split into a grid.
 */
export function SliceToolbar({
  view,
  output,
  offered,
  selected,
  onNewSlice,
}: {
  readonly view: DocumentView;
  readonly output: Output;
  readonly offered: OfferedDisplaySize;
  readonly selected: Slice | undefined;
  readonly onNewSlice: () => void;
}) {
  const command = useCommand(view);
  const [grid, setGrid] = useState({ columns: 3, rows: 1 });
  const size = output.displaySize ?? offered.size;
  const setSize = (displaySize: DisplaySize) =>
    void command("output.update", { outputId: output.id, displaySize });
  const count = (value: number) =>
    Math.min(settings.slices.maxSplit, Math.max(1, Math.round(value)));
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-2">
      <Button
        size="sm"
        title="Add a Slice in the largest empty part of the Display Frame"
        onClick={onNewSlice}
      >
        <Plus data-icon="inline-start" /> New Slice
      </Button>
      <span className="mx-1 h-8 w-px bg-border" aria-hidden />
      <div className="grid w-24 gap-1">
        <NumberField
          label="Display width"
          unit="px"
          decimals={0}
          step={1}
          value={size.width}
          onCommit={(width) =>
            setSize({ ...size, width: Math.max(1, Math.round(width)) })
          }
        />
      </div>
      <div className="grid w-24 gap-1">
        <NumberField
          label="Height"
          unit="px"
          decimals={0}
          step={1}
          value={size.height}
          onCommit={(height) =>
            setSize({ ...size, height: Math.max(1, Math.round(height)) })
          }
        />
      </div>
      {offered.source.kind !== "fallback" &&
        !sameSize(output.displaySize, offered.size) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSize(offered.size)}
          >
            {offeredLabel(offered)}
          </Button>
        )}
      {selected !== undefined && (
        <>
          <span className="mx-1 h-8 w-px bg-border" aria-hidden />
          <Button
            size="sm"
            variant="outline"
            title="Turn the selected Slice a quarter clockwise on stage"
            onClick={() =>
              void command("slice.update", {
                sliceId: selected.id,
                rotation: (selected.rotation + 90) % 360,
              })
            }
          >
            <RotateCw data-icon="inline-start" /> Rotate
          </Button>
          <div className="grid w-16 gap-1">
            <NumberField
              label="Columns"
              decimals={0}
              step={1}
              value={grid.columns}
              onCommit={(columns) =>
                setGrid({ ...grid, columns: count(columns) })
              }
            />
          </div>
          <div className="grid w-16 gap-1">
            <NumberField
              label="Rows"
              decimals={0}
              step={1}
              value={grid.rows}
              onCommit={(rows) => setGrid({ ...grid, rows: count(rows) })}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={grid.columns * grid.rows === 1}
            title={`Split ${selected.name} into ${String(grid.columns)}×${String(grid.rows)} Slices`}
            onClick={() =>
              void command("slice.split", { sliceId: selected.id, ...grid })
            }
          >
            <Grid2x2 data-icon="inline-start" /> Split
          </Button>
        </>
      )}
    </div>
  );
}
