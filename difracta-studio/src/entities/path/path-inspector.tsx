import type { DocumentView } from "@difracta/client";
import {
  PATH_POINTS,
  type Mask,
  type Path,
  type Surface,
  type Table,
} from "@difracta/core";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CalibrationControls } from "@/inspector/fields/calibration-controls";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import {
  nudgeKeyHandler,
  PolygonEditor,
} from "@/inspector/fields/polygon-editor";
import { SelectField } from "@/inspector/fields/select-field";
import { calibrationFor, useCalibration } from "@/lib/calibration";
import { useCommand, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSelection } from "@/selection/selection";

import { surfaceAspect } from "@/entities/mask/mask-inspector";

const shapes = [
  { value: "closed", label: "Closed: the last point joins the first" },
  { value: "open", label: "Open: a line from the first point to the last" },
] as const;

/**
 * A Path's name, whether it closes, and its points in the same editor a
 * Mask uses, with the Surface's Masks and other Paths dashed for context.
 * Points are numbered in travel order, which is what gives the Path its
 * sides.
 */
export function PathInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const path = useDocumentPath<Path>(view, ["paths", id]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const { calibration } = useCalibration(view);
  const [selected, setSelected] = useState(
    () =>
      calibrationFor(calibration, path?.surfaceId ?? "", null, id)?.point ?? 0,
  );

  useEffect(() => {
    if (path === undefined) select({ kind: "installation" });
  }, [path, select]);
  if (path === undefined) return null;
  const surface = surfaces[path.surfaceId];
  const point = Math.min(selected, path.points.length - 1);
  const outlines = [
    ...Object.values(masks).filter((mask) => mask.surfaceId === path.surfaceId),
    ...Object.values(paths).filter(
      (other) => other.surfaceId === path.surfaceId && other.id !== path.id,
    ),
  ].map((shape) => ({ name: shape.name, points: shape.points }));
  const nudge = (index: number, by: { x: number; y: number }): void =>
    void command("path.point.nudge", { pathId: id, index, by });

  return (
    <>
      <InspectorHeading name={path.name} id={path.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={path.name}
          onCommit={(name) => void command("path.rename", { pathId: id, name })}
        />
        <SelectField
          label="Shape"
          value={path.closed ? "closed" : "open"}
          options={shapes}
          onValueChange={(shape) =>
            void command("path.update", {
              pathId: id,
              closed: shape === "closed",
            })
          }
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <span className="text-xs text-muted-foreground">
            Points, in {surface?.name ?? "the Surface"}, in travel order
          </span>
          <PolygonEditor
            points={path.points}
            names={path.points.map((_, index) => String(index + 1))}
            outlines={outlines}
            aspect={surfaceAspect(surface)}
            selected={point}
            onSelect={setSelected}
            onSet={(index, next) =>
              command("path.point.set", { pathId: id, index, point: next })
            }
            onNudge={nudge}
            spaceLabel="Path points in Surface Space"
            closed={path.closed}
          />
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup">
            {path.points.map((_, index) => (
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
                onFocus={() => setSelected(index)}
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
              disabled={path.points.length >= PATH_POINTS.max}
              title={
                !path.closed && point === path.points.length - 1
                  ? "Continue the line past the last point"
                  : "Insert a point halfway to the next one"
              }
              onClick={() =>
                void command("path.point.add", { pathId: id, after: point })
              }
            >
              <Plus data-icon="inline-start" /> Add point
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={path.points.length <= PATH_POINTS.min}
              onClick={() =>
                void command("path.point.remove", { pathId: id, index: point })
              }
            >
              <Minus data-icon="inline-start" /> Remove point
            </Button>
          </div>
        </div>
        <CalibrationControls
          view={view}
          surfaceId={path.surfaceId}
          maskId={null}
          pathId={path.id}
          corner={null}
          point={point}
          disabled={surface?.output == null}
        />
      </div>
    </>
  );
}
