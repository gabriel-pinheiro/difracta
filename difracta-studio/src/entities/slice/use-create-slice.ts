import type { DocumentView } from "@difracta/client";
import { generateId, outputSlices, type SliceRect } from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";
import { useCallback } from "react";

import { offeredDisplaySize } from "@/entities/output/display-size";
import { sessionList, type SessionTable } from "@/entities/output/output-live";
import { useCommand } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { createSliceSteps } from "./slice-create";
import { useSliceEditor } from "./slice-editor-state";

/**
 * Adds a Slice to an Output and shows it: the Slice editor opens on that
 * Output with the new Slice selected. The navigator's "+ Slice", the
 * editor's New Slice and a rectangle drawn in the Display pane all come
 * here. The document and the live state are read when it runs.
 */
export function useCreateSlice(
  view: DocumentView,
): (outputId: string, rect?: SliceRect) => Promise<void> {
  const command = useCommand(view);
  const { select } = useSelection();
  const { open } = useSliceEditor();
  return useCallback(
    async (outputId, rect) => {
      const output = view.get()?.outputs[outputId];
      if (output === undefined) return;
      const offered = offeredDisplaySize(
        view.valueAt<Record<string, DisplayHostLive>>(["live", "displayHosts"]),
        sessionList(
          view.valueAt<SessionTable>(["live", "outputs", outputId, "sessions"]),
        ),
        outputId,
      );
      const id = generateId("slice");
      const steps = createSliceSteps({
        output,
        sliceCount: outputSlices(view.get()?.slices ?? {}, outputId).length,
        offered: offered.size,
        id,
        rect,
      });
      for (const step of steps) await command(step.name, step.payload);
      open(outputId);
      select({ kind: "slice", id });
    },
    [view, command, open, select],
  );
}
