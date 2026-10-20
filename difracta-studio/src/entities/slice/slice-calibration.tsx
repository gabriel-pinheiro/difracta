import type { DocumentView } from "@difracta/client";
import { Crosshair } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sliceCalibrationFor, useCalibration } from "@/lib/calibration";

/**
 * Enters and leaves the Output's Slice test card with `sliceId` selected:
 * each Slice in its own colour with its name and an up arrow, sliced like
 * the Scene, so a misplaced or turned panel shows on stage. Selecting
 * another Slice while it is on moves the highlight
 * (`CalibrationFollowsSelection`).
 */
export function SliceCalibrationControls({
  view,
  outputId,
  sliceId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
  readonly sliceId: string;
}) {
  const { calibration, set, exit } = useCalibration(view);
  const active = sliceCalibrationFor(calibration, outputId);
  return (
    <Button
      variant={active === undefined ? "outline" : "default"}
      size="sm"
      aria-pressed={active !== undefined}
      title="Show every Slice on the Output in its own colour, with its name and an up arrow"
      onClick={() => {
        if (active !== undefined) exit();
        else
          set({
            surfaceId: null,
            outputId,
            outputMaskId: null,
            sliceId,
            maskId: null,
            pathId: null,
            regionId: null,
            corner: null,
            point: null,
            view: "patterns",
          });
      }}
    >
      <Crosshair data-icon="inline-start" />
      {active === undefined ? "Calibrate" : "Stop calibrating"}
    </Button>
  );
}
