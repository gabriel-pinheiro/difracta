import type { DocumentView } from "@difracta/client";
import {
  CALIBRATION_VIEWS,
  type CalibrationView,
  type CornerName,
} from "@difracta/core";
import { Crosshair } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { calibrationFor, useCalibration } from "@/lib/calibration";

import { SelectField } from "./select-field";

const viewLabels: Record<CalibrationView, string> = {
  selected: "Hidden",
  outlines: "Outlines",
  patterns: "Patterns",
};

/**
 * Enters and leaves Calibration Mode for one Surface or Mask, and picks what
 * the Output's other Surfaces show meanwhile. While active, the corner or
 * point selected in the inspector is mirrored to the Output as it changes.
 */
export function CalibrationControls({
  view,
  surfaceId,
  maskId,
  corner,
  point,
  disabled = false,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
  readonly maskId: string | null;
  readonly corner: CornerName | null;
  readonly point: number | null;
  readonly disabled?: boolean;
}) {
  const { calibration, set, exit } = useCalibration(view);
  const active = calibrationFor(calibration, surfaceId, maskId);
  const selection = { surfaceId, maskId, corner, point };

  useEffect(() => {
    if (active === undefined) return;
    if (active.corner === corner && active.point === point) return;
    set({ ...active, corner, point });
  }, [active, corner, point, set]);

  return (
    <div className="grid gap-2">
      <Button
        variant={active === undefined ? "outline" : "default"}
        size="sm"
        aria-pressed={active !== undefined}
        disabled={disabled}
        title={
          disabled
            ? "Assign an Output first"
            : "Show a pattern on the Output while aligning"
        }
        onClick={() => {
          if (active !== undefined) exit();
          else set({ ...selection, view: calibration?.view ?? "selected" });
        }}
      >
        <Crosshair data-icon="inline-start" />
        {active === undefined ? "Calibrate" : "Stop calibrating"}
      </Button>
      {active !== undefined && (
        <SelectField
          label="Other Surfaces meanwhile"
          value={active.view}
          options={CALIBRATION_VIEWS.map((value) => ({
            value,
            label: viewLabels[value],
          }))}
          onValueChange={(next) => {
            if (next !== null)
              set({ ...active, view: next as CalibrationView });
          }}
        />
      )}
    </div>
  );
}
