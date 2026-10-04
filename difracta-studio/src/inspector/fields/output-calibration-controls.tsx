import type { DocumentView } from "@difracta/client";
import { Crosshair } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { outputCalibrationFor, useCalibration } from "@/lib/calibration";

/**
 * Enters and leaves Calibration Mode for one Output: every Surface on it
 * shown as a pattern, with one of its Output Masks outlined on top when
 * `outputMaskId` names one. There is no Output to pick and no other
 * Surfaces to choose a view for, so only the button shows. While active,
 * the point selected in the inspector is mirrored to the Output as it
 * changes.
 */
export function OutputCalibrationControls({
  view,
  outputId,
  outputMaskId = null,
  point = null,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
  readonly outputMaskId?: string | null;
  readonly point?: number | null;
}) {
  const { calibration, set, exit } = useCalibration(view);
  const active = outputCalibrationFor(calibration, outputId, outputMaskId);

  useEffect(() => {
    if (active === undefined || active.point === point) return;
    set({ ...active, point });
  }, [active, point, set]);

  return (
    <Button
      variant={active === undefined ? "outline" : "default"}
      size="sm"
      aria-pressed={active !== undefined}
      title={
        outputMaskId === null
          ? "Show every Surface on the Output as a pattern"
          : "Show the Output's Surfaces as patterns with this mask outlined"
      }
      onClick={() => {
        if (active !== undefined) exit();
        else
          set({
            surfaceId: null,
            outputId,
            outputMaskId,
            maskId: null,
            pathId: null,
            regionId: null,
            corner: null,
            point,
            view: "patterns",
          });
      }}
    >
      <Crosshair data-icon="inline-start" />
      {active === undefined ? "Calibrate" : "Stop calibrating"}
    </Button>
  );
}
