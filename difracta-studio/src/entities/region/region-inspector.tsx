import type { DocumentView } from "@difracta/client";
import {
  REGION_CORNERS,
  type Layer,
  type Point,
  type Region,
  type RegionBounds,
  type RegionCorner,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect, useState } from "react";

import { surfaceAspect } from "@/entities/mask/mask-inspector";
import { CalibrationControls } from "@/inspector/fields/calibration-controls";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import {
  nudgeKeyHandler,
  PolygonEditor,
} from "@/inspector/fields/polygon-editor";
import { calibrationFor, useCalibration } from "@/lib/calibration";
import { useCommand, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSelection } from "@/selection/selection";

const cornerLabels: Record<RegionCorner, string> = {
  topLeft: "Top left",
  bottomRight: "Bottom right",
};
const cornerShortLabels: Record<RegionCorner, string> = {
  topLeft: "TL",
  bottomRight: "BR",
};

/** The rectangle's four corners from the two that define it, for drawing. */
export function rectanglePoints(
  topLeft: Point,
  bottomRight: Point,
): readonly Point[] {
  return [
    topLeft,
    { x: bottomRight.x, y: topLeft.y },
    bottomRight,
    { x: topLeft.x, y: bottomRight.y },
  ];
}

/**
 * A Region's name and its two corners in its Surface, edited like a Mask's
 * points: handles in the Surface's shape with the sibling Regions for
 * context, one button per corner for arrow-key nudges, and Calibrate to
 * see the rectangle on the Output.
 */
export function RegionInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const region = useDocumentPath<Region>(view, ["regions", id]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]) ?? {};
  const { calibration } = useCalibration(view);
  // Open on the corner the Output already highlights, if it does.
  const [selected, setSelected] = useState(() => {
    const corner = calibrationFor(
      calibration,
      region?.surfaceId ?? "",
      null,
      null,
      id,
    )?.corner;
    const index = REGION_CORNERS.indexOf(corner as RegionCorner);
    return index < 0 ? 0 : index;
  });

  useEffect(() => {
    if (region === undefined) select({ kind: "installation" });
  }, [region, select]);
  if (region === undefined) return null;
  const surface = surfaces[region.surfaceId];
  const cornerAt = (index: number): RegionCorner =>
    REGION_CORNERS[index] ?? "topLeft";
  const nudge = (index: number, by: Point): void =>
    void command("region.corner.nudge", {
      regionId: id,
      corner: cornerAt(index),
      by,
    });
  const siblings = Object.values(regions).flatMap((other) =>
    other.surfaceId === region.surfaceId && other.id !== region.id
      ? [
          {
            name: other.name,
            points: rectanglePoints(
              other.bounds.topLeft,
              other.bounds.bottomRight,
            ),
          },
        ]
      : [],
  );
  const targeting = Object.values(layers).filter(
    (layer) => layer.kind === "visual" && layer.target === region.id,
  ).length;

  return (
    <>
      <InspectorHeading name={region.name} id={region.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={region.name}
          onCommit={(name) =>
            void command("region.rename", { regionId: id, name })
          }
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <span className="text-xs text-muted-foreground">
            Corners, in {surface?.name ?? "the Surface"}
          </span>
          <PolygonEditor
            points={[region.bounds.topLeft, region.bounds.bottomRight]}
            names={REGION_CORNERS.map((corner) => cornerShortLabels[corner])}
            shapeOf={(points) => rectangleOf(points, region.bounds)}
            outlines={siblings}
            aspect={surfaceAspect(surface)}
            selected={selected}
            onSelect={setSelected}
            onSet={(index, point) =>
              command("region.corner.set", {
                regionId: id,
                corner: cornerAt(index),
                point,
              })
            }
            onNudge={nudge}
            spaceLabel="Region corners in Surface Space"
          />
          <div className="mt-2 grid grid-cols-2 gap-1" role="radiogroup">
            {REGION_CORNERS.map((corner, index) => (
              <button
                key={corner}
                type="button"
                role="radio"
                aria-checked={index === selected}
                title="Arrow keys move the corner; Shift for larger, Ctrl for finer steps"
                className={cn(
                  "h-6 rounded-md border text-xs focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                  index === selected
                    ? "border-selection bg-selection/15"
                    : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onKeyDown={nudgeKeyHandler(index, nudge)}
              >
                {cornerLabels[corner]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[0.6875rem]/relaxed text-muted-foreground">
            The Region follows {surface?.name ?? "its Surface"}: its mapping and
            Masks apply, and recalibrating the Surface moves it too.{" "}
            {targeting === 0
              ? "No Layer targets it yet."
              : `${String(targeting)} ${targeting === 1 ? "Layer targets" : "Layers target"} it.`}
          </p>
        </div>
        <CalibrationControls
          view={view}
          surfaceId={region.surfaceId}
          maskId={null}
          regionId={region.id}
          corner={cornerAt(selected)}
          point={null}
          disabled={surface?.output == null}
        />
      </div>
    </>
  );
}

/** The rectangle the two handles span while one of them is dragged. */
function rectangleOf(
  points: readonly Point[],
  bounds: RegionBounds,
): readonly Point[] {
  const topLeft = points[0] ?? bounds.topLeft;
  const bottomRight = points[1] ?? bounds.bottomRight;
  return rectanglePoints(topLeft, bottomRight);
}
