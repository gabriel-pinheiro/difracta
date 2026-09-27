import type { DocumentView } from "@difracta/client";
import {
  CORNERS,
  enabledCorners,
  isEnabledOn,
  orderedEntries,
  tableEntries,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CalibrationControls } from "@/inspector/fields/calibration-controls";
import { calibrationFor, useCalibration } from "@/lib/calibration";
import { useCommand, useDocumentPath } from "@/lib/client";
import { pickMappingOutput, useMappingOutput } from "@/lib/mapping-output";

import {
  primarySession,
  sessionList,
  type SessionTable,
} from "@/entities/output/output-live";

import { QuadEditor, quadPoints } from "./quad-editor";

/** Frame shape assumed until an Output Session reports its real resolution. */
const DEFAULT_ASPECT = 16 / 9;

/**
 * Where the Surface goes: every Output as a row with its switch, so the
 * closed list says which ones show it. The Surface has one mapping per
 * Output, and at most one row is open with that Output's corners and its
 * Calibrate. On several Outputs none opens by itself, so the operator picks
 * the projector before any corner can move.
 */
export function SurfaceOutputs({
  view,
  surface,
}: {
  readonly view: DocumentView;
  readonly surface: Surface;
}) {
  const command = useCommand(view);
  const outputs = orderedEntries(
    useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {},
  );
  const { outputId, pick } = useMappingOutput(view, surface.id);
  const assign = (ids: readonly string[], enabled: boolean) =>
    command("surface.assign", {
      surfaceId: surface.id,
      outputs: ids,
      enabled,
    });
  const off = outputs.filter((output) => !isEnabledOn(surface, output.id));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Outputs</span>
        {outputs.length > 1 && off.length > 0 && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void assign(
                off.map((output) => output.id),
                true,
              )
            }
          >
            Turn all on
          </Button>
        )}
      </div>
      {outputs.length === 0 ? (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          No Outputs yet. Add one in the Outputs section to place this Surface
          in its frame.
        </p>
      ) : (
        <Accordion
          value={outputId === undefined ? [] : [outputId]}
          onValueChange={(open: readonly unknown[]) =>
            pick(typeof open[0] === "string" ? open[0] : undefined)
          }
        >
          {outputs.map((output) => {
            const enabled = isEnabledOn(surface, output.id);
            return (
              <AccordionItem
                key={output.id}
                value={output.id}
                disabled={!enabled}
              >
                <div className="flex items-center gap-2 pr-2 *:first:min-w-0 *:first:flex-1">
                  <AccordionTrigger className="min-w-0 items-center py-1.5 hover:no-underline">
                    <span className="truncate">{output.name}</span>
                  </AccordionTrigger>
                  <Switch
                    size="sm"
                    aria-label={`Show on ${output.name}`}
                    checked={enabled}
                    onCheckedChange={(next) => {
                      // Turning one on is choosing it; a running calibration stays where it is.
                      if (next) pickMappingOutput(surface.id, output.id);
                      void assign([output.id], next);
                    }}
                  />
                </div>
                <AccordionContent className="pb-2">
                  {output.id === outputId && (
                    <Mapping
                      view={view}
                      surface={surface}
                      outputId={output.id}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
      {outputs.length > 0 && off.length === outputs.length && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          Turn an Output on to place this Surface in its frame.
        </p>
      )}
      {outputId === undefined && outputs.length - off.length > 1 && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          This Surface has a mapping of its own on each Output. Open the one to
          place or calibrate.
        </p>
      )}
    </div>
  );
}

/** Corner editing for one Output's mapping; other Surfaces on that Output give context. */
function Mapping({
  view,
  surface,
  outputId,
}: {
  readonly view: DocumentView;
  readonly surface: Surface;
  readonly outputId: string;
}) {
  const command = useCommand(view);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const sessions = useDocumentPath<SessionTable>(view, [
    "live",
    "outputs",
    outputId,
    "sessions",
  ]);
  const telemetry = primarySession(sessionList(sessions))?.telemetry;
  const aspect =
    telemetry === undefined || telemetry === null
      ? DEFAULT_ASPECT
      : telemetry.width / telemetry.height;
  const { calibration } = useCalibration(view);
  // Open on the corner the Output already highlights, if it does.
  const [selected, setSelected] = useState(() => {
    const corner = calibrationFor(calibration, surface.id, null)?.corner;
    return corner == null ? 0 : CORNERS.indexOf(corner);
  });
  const corners = enabledCorners(surface, outputId);
  if (corners === undefined) return null;
  const others = tableEntries(surfaces).flatMap((other) => {
    const quad = enabledCorners(other, outputId);
    return other.id !== surface.id && quad !== undefined
      ? [{ name: other.name, points: quadPoints(quad) }]
      : [];
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <QuadEditor
        corners={corners}
        others={others}
        aspect={aspect}
        selected={selected}
        onSelect={setSelected}
        onSet={(corner, point) =>
          command("surface.corner.set", {
            surfaceId: surface.id,
            output: outputId,
            corner,
            point,
          })
        }
        onNudge={(corner, by) =>
          void command("surface.corner.nudge", {
            surfaceId: surface.id,
            output: outputId,
            corner,
            by,
          })
        }
      />
      <CalibrationControls
        view={view}
        surfaceId={surface.id}
        maskId={null}
        corner={CORNERS[selected] ?? "topLeft"}
        point={null}
        outputPicker={false}
      />
    </div>
  );
}
