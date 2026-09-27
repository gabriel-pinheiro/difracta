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
import { useMappingOutput } from "@/lib/mapping-output";

import { SelectField } from "./select-field";

const viewLabels: Record<CalibrationView, string> = {
  selected: "Hidden",
  outlines: "Outlines",
  patterns: "Patterns",
};

/**
 * Enters and leaves Calibration Mode for one Surface, Mask, Path or
 * Region on one Output, and picks what that Output's other Surfaces show
 * meanwhile. A Surface on several Outputs gets a "Show on" select, unless
 * the caller picks the Output itself. While active, the corner or point
 * selected in the inspector is mirrored to the Output as it changes.
 */
export function CalibrationControls({
  view,
  surfaceId,
  maskId,
  pathId = null,
  regionId = null,
  corner,
  point,
  outputPicker = true,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
  readonly maskId: string | null;
  readonly pathId?: string | null;
  readonly regionId?: string | null;
  readonly corner: CornerName | null;
  readonly point: number | null;
  readonly outputPicker?: boolean;
}) {
  const { calibration, set, exit } = useCalibration(view);
  const { outputId, enabled, pick } = useMappingOutput(view, surfaceId);
  const active = calibrationFor(
    calibration,
    surfaceId,
    maskId,
    pathId,
    regionId,
  );
  const selection = { surfaceId, maskId, pathId, regionId, corner, point };

  useEffect(() => {
    if (active === undefined) return;
    if (active.corner === corner && active.point === point) return;
    set({ ...active, corner, point });
  }, [active, corner, point, set]);

  return (
    <div className="grid gap-2">
      {outputPicker && enabled.length > 1 && (
        <SelectField
          label="Show on"
          value={outputId ?? null}
          noneLabel="Pick an Output"
          options={enabled.map((output) => ({
            value: output.id,
            label: output.name,
          }))}
          onValueChange={(next) => pick(next ?? undefined)}
        />
      )}
      <Button
        variant={active === undefined ? "outline" : "default"}
        size="sm"
        aria-pressed={active !== undefined}
        disabled={outputId === undefined}
        title="Show a pattern on the Output while aligning"
        onClick={() => {
          if (active !== undefined) exit();
          else if (outputId !== undefined)
            set({
              ...selection,
              outputId,
              view: calibration?.view ?? "selected",
            });
        }}
      >
        <Crosshair data-icon="inline-start" />
        {active === undefined ? "Calibrate" : "Stop calibrating"}
      </Button>
      {outputId === undefined && (
        // A disabled button shows no tooltip, so the reason is written out.
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          {enabled.length === 0
            ? "Calibrating needs the Surface on an Output."
            : "This Surface is on several Outputs. Pick the one to calibrate on."}
        </p>
      )}
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
