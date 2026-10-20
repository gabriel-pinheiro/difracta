import type { DocumentView } from "@difracta/client";
import {
  outputSlices,
  projectionFrame,
  type Output,
  type Slice,
  type Table,
} from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";
import { LayoutPanelTop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSliceEditor } from "@/entities/slice/slice-editor-state";
import { useCreateSlice } from "@/entities/slice/use-create-slice";
import { NumberField } from "@/inspector/fields/number-field";
import { useCommand, useDocumentPath } from "@/lib/client";

import { formatSize, sameSize, showingDisplay } from "./display-size";

/**
 * The Output's Display size, the pixel size its Display receives, with the
 * size of a Display showing it one click away; the Projection Frame's size
 * when Slices decide it; and the way into the Slice editor.
 */
export function DisplaySizeField({
  view,
  output,
}: {
  readonly view: DocumentView;
  readonly output: Output;
}) {
  const command = useCommand(view);
  const editor = useSliceEditor();
  const createSlice = useCreateSlice(view);
  const slices = outputSlices(
    useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {},
    output.id,
  );
  const display = showingDisplay(
    useDocumentPath<Record<string, DisplayHostLive>>(view, [
      "live",
      "displayHosts",
    ]),
    output.id,
  );
  const size = output.displaySize;
  const frame =
    slices.length === 0 ? undefined : projectionFrame(output, slices);
  const set = (width: number, height: number) =>
    void command("output.update", {
      outputId: output.id,
      displaySize: {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      },
    });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <span className="text-xs text-muted-foreground">Display size</span>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Width"
          unit="px"
          decimals={0}
          step={1}
          value={size?.width ?? 0}
          onCommit={(width) => set(width, size?.height ?? width * (9 / 16))}
        />
        <NumberField
          label="Height"
          unit="px"
          decimals={0}
          step={1}
          value={size?.height ?? 0}
          onCommit={(height) => set(size?.width ?? height * (16 / 9), height)}
        />
      </div>
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        {size === null
          ? "The pixel size the Display receives, such as an LED processor's input. Not set yet."
          : "The pixel size the Display receives, such as an LED processor's input."}
      </p>
      {display !== undefined && !sameSize(size, display.size) && (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => set(display.size.width, display.size.height)}
        >
          Use {display.label}'s size ({formatSize(display.size)})
        </Button>
      )}
      {frame !== undefined && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          Projection Frame{" "}
          <span className="font-mono text-foreground">{formatSize(frame)}</span>
          , worked out from where its {slices.length} Slices sit.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          slices.length === 0
            ? void createSlice(output.id)
            : editor.open(output.id)
        }
      >
        <LayoutPanelTop data-icon="inline-start" />
        {slices.length === 0 ? "Add Slice" : "Edit Slices"}
      </Button>
    </div>
  );
}
