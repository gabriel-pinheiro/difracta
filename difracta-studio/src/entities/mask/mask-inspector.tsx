import type { DocumentView } from "@difracta/client";
import {
  MASK_POINTS,
  type Mask,
  type Surface,
  type Table,
} from "@difracta/core";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CalibrationControls } from "@/inspector/fields/calibration-controls";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { NumberField } from "@/inspector/fields/number-field";
import { fromPercent, toPercent } from "@/inspector/fields/points";
import {
  nudgeKeyHandler,
  PolygonEditor,
} from "@/inspector/fields/polygon-editor";
import { SelectField } from "@/inspector/fields/select-field";
import { calibrationFor, useCalibration } from "@/lib/calibration";
import { useCommand, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSelection } from "@/selection/selection";

import { quadPoints } from "@/entities/surface/quad-editor";

const modes = [
  { value: "include", label: "Include: only its area is lit" },
  { value: "exclude", label: "Exclude: its area is never lit" },
] as const;

export function MaskInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const mask = useDocumentPath<Mask>(view, ["masks", id]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const { calibration } = useCalibration(view);
  // Open on the point the Output already highlights, if it does.
  const [selected, setSelected] = useState(
    () => calibrationFor(calibration, mask?.surfaceId ?? "", id)?.point ?? 0,
  );

  useEffect(() => {
    if (mask === undefined) select({ kind: "installation" });
  }, [mask, select]);
  if (mask === undefined) return null;
  const surface = surfaces[mask.surfaceId];
  const point = Math.min(selected, mask.points.length - 1);
  const siblings = Object.values(masks).flatMap((other) =>
    other.surfaceId === mask.surfaceId && other.id !== mask.id
      ? [{ name: other.name, points: other.points }]
      : [],
  );
  const nudge = (index: number, by: { x: number; y: number }): void =>
    void command("mask.point.nudge", { maskId: id, index, by });

  return (
    <>
      <InspectorHeading name={mask.name} id={mask.id} />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={mask.name}
          onCommit={(name) => void command("mask.rename", { maskId: id, name })}
        />
        <SelectField
          label="Mode"
          value={mask.mode}
          options={modes}
          onValueChange={(mode) =>
            void command("mask.update", { maskId: id, mode })
          }
        />
        <NumberField
          label="Feather"
          unit="%"
          step={0.1}
          value={toPercent(mask.feather)}
          onCommit={(value) =>
            void command("mask.update", {
              maskId: id,
              feather: Math.min(1, Math.max(0, fromPercent(value))),
            })
          }
        />
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            Points, in {surface?.name ?? "the Surface"}
          </span>
          <PolygonEditor
            points={mask.points}
            names={mask.points.map((_, index) => String(index + 1))}
            outlines={siblings}
            aspect={surfaceAspect(surface)}
            selected={point}
            onSelect={setSelected}
            onSet={(index, next) =>
              command("mask.point.set", { maskId: id, index, point: next })
            }
            onNudge={nudge}
            spaceLabel="Mask points in Surface Space"
          />
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup">
            {mask.points.map((_, index) => (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={index === point}
                title="Arrow keys move the point; Shift for larger, Ctrl for finer steps"
                className={cn(
                  "h-6 min-w-6 rounded-md border px-1.5 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                  index === point
                    ? "border-selection bg-selection/15"
                    : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => setSelected(index)}
                onKeyDown={nudgeKeyHandler(index, nudge)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={mask.points.length >= MASK_POINTS.max}
              title="Insert a point halfway to the next one"
              onClick={() =>
                void command("mask.point.add", { maskId: id, after: point })
              }
            >
              <Plus data-icon="inline-start" /> Add point
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={mask.points.length <= MASK_POINTS.min}
              onClick={() =>
                void command("mask.point.remove", { maskId: id, index: point })
              }
            >
              <Minus data-icon="inline-start" /> Remove point
            </Button>
          </div>
        </div>
        <CalibrationControls
          view={view}
          surfaceId={mask.surfaceId}
          maskId={mask.id}
          corner={null}
          point={point}
          disabled={surface?.output == null}
        />
      </div>
    </>
  );
}

/**
 * Surface Space has no aspect of its own; the enabled mapping's bounding box
 * gives the preview a shape close to what the projector shows.
 */
function surfaceAspect(surface: Surface | undefined): number {
  const mapping =
    surface?.output === null || surface === undefined
      ? undefined
      : surface.mappings[surface.output];
  if (mapping === undefined) return 1;
  const xs = quadPoints(mapping.corners).map((point) => point.x);
  const ys = quadPoints(mapping.corners).map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return width > 0 && height > 0 ? (width / height) * (16 / 9) : 1;
}
