import type { DocumentView } from "@difracta/client";
import {
  outputSlices,
  type Output,
  type Slice,
  type Table,
} from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { formatSize, offeredDisplaySize } from "@/entities/output/display-size";
import { sessionList, type SessionTable } from "@/entities/output/output-live";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useLatestWins } from "@/lib/use-latest-wins";
import { useSelection } from "@/selection/selection";

import { SliceDisplayPane } from "./slice-display-pane";
import { sliceDragPayload, type SliceDragChange } from "./slice-drag";
import { useSliceEditor } from "./slice-editor-state";
import { SliceStagePane } from "./slice-stage-pane";
import { SliceToolbar } from "./slice-toolbar";
import { useCreateSlice } from "./use-create-slice";

/**
 * An Output's Slices in the whole center column: on the left the Display
 * Frame, where Slices are drawn to match the processor's map, on the right
 * the Projection Frame, where the same Slices are laid out as the panels
 * hang. Selection is the navigator's, so the inspector beside it has the
 * exact numbers. Done or Escape closes it. Before the first Slice the
 * Output's Display size is filled in from a Display showing it, else its
 * Output Session, else the usual HDMI size.
 */
export function SliceEditor({
  view,
  outputId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
}) {
  const command = useCommand(view);
  const { close } = useSliceEditor();
  const { selection, select } = useSelection();
  const createSlice = useCreateSlice(view);
  const output = useDocumentPath<Output>(view, ["outputs", outputId]);
  const slices = outputSlices(
    useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {},
    outputId,
  );
  const offered = offeredDisplaySize(
    useDocumentPath<Record<string, DisplayHostLive>>(view, [
      "live",
      "displayHosts",
    ]),
    sessionList(
      useDocumentPath<SessionTable>(view, [
        "live",
        "outputs",
        outputId,
        "sessions",
      ]),
    ),
    outputId,
  );
  const sendDrag = useLatestWins(
    ({
      id,
      change,
    }: {
      readonly id: string;
      readonly change: SliceDragChange;
    }) => command("slice.update", sliceDragPayload(id, change)),
  );

  useEffect(() => {
    if (output === undefined) close();
  }, [output, close]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=dialog]") != null) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  if (output === undefined) return null;

  const size = output.displaySize ?? offered.size;
  const selected = slices.find(
    (slice) => selection?.kind === "slice" && slice.id === selection.id,
  );

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 p-2">
      <header className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
          Slices of {output.name}
        </h2>
        <span className="text-[0.625rem] text-muted-foreground">
          Esc closes
        </span>
        <Button size="sm" onClick={close}>
          Done
        </Button>
      </header>
      <SliceToolbar
        view={view}
        output={output}
        offered={offered}
        selected={selected}
        onNewSlice={() => void createSlice(outputId)}
      />
      <div className="grid min-h-0 grid-cols-2 gap-3">
        <SliceDisplayPane
          size={size}
          slices={slices}
          selectedId={selected?.id}
          onSelect={(id) => select({ kind: "slice", id })}
          onRect={(id, rect) => sendDrag({ id, change: { rect } })}
          onDraw={(rect) => void createSlice(outputId, rect)}
        />
        {slices.length === 0 ? (
          <div className="grid place-content-center gap-2 rounded-md border border-dashed p-4 text-center">
            <p className="max-w-72 text-[0.6875rem]/relaxed text-muted-foreground">
              Match the processor's input map: start with one Slice covering the{" "}
              {formatSize(size)} Display Frame and split it, or draw Slices on
              the left. Then lay them out here as the panels hang.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-center"
              onClick={() => void createSlice(outputId)}
            >
              Start with one Slice
            </Button>
          </div>
        ) : (
          <SliceStagePane
            output={output}
            slices={slices}
            selectedId={selected?.id}
            onSelect={(id) => select({ kind: "slice", id })}
            onPosition={(id, position) =>
              sendDrag({ id, change: { position } })
            }
            onScale={(id, scale) => sendDrag({ id, change: { scale } })}
          />
        )}
      </div>
    </div>
  );
}
