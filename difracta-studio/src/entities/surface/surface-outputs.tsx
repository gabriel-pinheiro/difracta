import type { DocumentView } from "@difracta/client";
import {
  CORNERS,
  enabledCorners,
  isEnabledOn,
  orderedEntries,
  outputSlices,
  placedRect,
  rectQuad,
  tableEntries,
  type Output,
  type Slice,
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

import { useOutputAspect } from "@/entities/output/output-aspect";
import { pixelFrame } from "@/entities/output/output-frame";

import { snapCorner } from "./corner-snap";
import { MappingPosition } from "./mapping-position";
import { QuadEditor, quadPoints } from "./quad-editor";

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

/**
 * Corner editing for one Output's mapping; other Surfaces on that Output
 * give context. On an Output with Slices the mapping may follow one or the
 * whole frame instead, with no corners to drag; free corners snap to the
 * Slices' edges, Alt held turning that off.
 */
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
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const slices = useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {};
  const aspect = useOutputAspect(view, outputId);
  const { calibration } = useCalibration(view);
  // Open on the corner the Output already highlights, if it does.
  const [selected, setSelected] = useState(() => {
    const corner = calibrationFor(calibration, surface.id, null)?.corner;
    return corner == null ? 0 : CORNERS.indexOf(corner);
  });
  const corners = enabledCorners({ outputs, slices }, surface, outputId);
  const mapping = surface.mappings[outputId];
  if (corners === undefined || mapping === undefined) return null;
  const output = outputs[outputId];
  const own = outputSlices(slices, outputId);
  const frame = pixelFrame(output, slices);
  const sliceQuads =
    frame === undefined
      ? []
      : own.map((slice) => rectQuad(placedRect(slice), frame));
  const calibrate = (
    <CalibrationControls
      view={view}
      surfaceId={surface.id}
      maskId={null}
      corner={CORNERS[selected] ?? "topLeft"}
      point={null}
      outputPicker={false}
    />
  );
  const position =
    own.length === 0 && mapping.follow === undefined ? null : (
      <MappingPosition
        view={view}
        surfaceId={surface.id}
        outputId={outputId}
        mapping={mapping}
        slices={own}
      />
    );
  if (mapping.follow !== undefined)
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {position}
        {calibrate}
      </div>
    );
  const others = tableEntries(surfaces).flatMap((other) => {
    const quad = enabledCorners({ outputs, slices }, other, outputId);
    return other.id !== surface.id && quad !== undefined
      ? [{ name: other.name, points: quadPoints(quad) }]
      : [];
  });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      {position}
      <QuadEditor
        backdrop={own.map((slice, index) => ({
          name: slice.name,
          points: quadPoints(sliceQuads[index] ?? corners),
        }))}
        snap={(point, context) => snapCorner(point, sliceQuads, context)}
        pixels={frame}
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
      {calibrate}
    </div>
  );
}
