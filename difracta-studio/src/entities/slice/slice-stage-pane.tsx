import {
  displayOverlaps,
  placedCorners,
  placedRect,
  projectionFrame,
  settings,
  type Output,
  type PixelRect,
  type Slice,
} from "@difracta/core";
import { useState, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";

import {
  capture,
  labelSize,
  SlicePane,
  snapThreshold,
  panePoint,
  usePaneRef,
} from "./slice-pane";
import { snapMove, snapScale, stageTargets } from "./slice-snap";

type Drag =
  | {
      readonly kind: "move";
      readonly id: string;
      readonly grab: { readonly x: number; readonly y: number };
      readonly position: { readonly x: number; readonly y: number };
      /** The shown box when the drag began, kept so the view holds still. */
      readonly box: PixelRect;
    }
  | {
      readonly kind: "scale";
      readonly id: string;
      readonly scale: number;
      readonly box: PixelRect;
    };

/**
 * The Projection Frame: the same Slices as placed tiles, laid out like the
 * stage. Drag a tile to move it, its bottom-right handle to scale it, with
 * edges snapping to the other tiles' edges (Alt turns snapping off). The
 * thick edge of each tile is the top of its Display rectangle, so a turned
 * panel reads at a glance. The frame's size is the tiles' bounding box.
 */
export function SliceStagePane({
  output,
  slices,
  selectedId,
  onSelect,
  onPosition,
  onScale,
}: {
  readonly output: Pick<Output, "displaySize">;
  readonly slices: readonly Slice[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onPosition: (
    id: string,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly onScale: (id: string, scale: number) => void;
}) {
  const svg = usePaneRef();
  const pointer = (event: ReactPointerEvent) => panePoint(svg, event);
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  const overlaps = displayOverlaps(slices);
  const shown = slices.map((slice) =>
    drag?.id !== slice.id
      ? slice
      : drag.kind === "move"
        ? { ...slice, position: drag.position }
        : { ...slice, scale: drag.scale },
  );
  const frame = projectionFrame(output, shown) ?? {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const box = drag?.box ?? frame;
  const font = labelSize(box);

  function move(event: ReactPointerEvent): void {
    if (drag === undefined) return;
    const point = pointer(event);
    const slice = slices.find((candidate) => candidate.id === drag.id);
    if (point === undefined || slice === undefined) return;
    const others = slices.filter((candidate) => candidate.id !== slice.id);
    const targets = stageTargets(others);
    const threshold = snapThreshold(event, point);
    if (drag.kind === "move") {
      const position = snapMove(
        placedRect(slice),
        point.x - drag.grab.x,
        point.y - drag.grab.y,
        targets,
        threshold,
      );
      setDrag({ ...drag, position });
      onPosition(slice.id, position);
    } else {
      const scale = snapScale(slice, point, targets, threshold, {
        min: settings.slices.minScale,
        max: settings.slices.maxScale,
      });
      setDrag({ ...drag, scale });
      onScale(slice.id, scale);
    }
  }

  function up(event: ReactPointerEvent<SVGSVGElement>): void {
    if (svg.current?.hasPointerCapture(event.pointerId) === true)
      svg.current.releasePointerCapture(event.pointerId);
    setDrag(undefined);
  }

  return (
    <SlicePane
      title="Projection Frame: the panels as they hang"
      caption={`${String(frame.width)}×${String(frame.height)} px, worked out from the tiles · Alt turns snapping off`}
      box={box}
      svgRef={svg}
      onPointerMove={move}
      onPointerUp={up}
    >
      <rect
        {...frame}
        className="fill-background/60 stroke-muted-foreground/40"
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      {shown.map((slice) => {
        const rect = placedRect(slice);
        const corners = placedCorners(slice);
        const selected = slice.id === selectedId;
        return (
          <g key={slice.id}>
            <rect
              {...rect}
              className={cn(
                "cursor-move",
                selected
                  ? "fill-selection/25 stroke-selection"
                  : "fill-muted/60 stroke-muted-foreground",
                overlaps.has(slice.id) && "stroke-destructive",
              )}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => {
                const point = pointer(event);
                if (point === undefined) return;
                capture(svg, event);
                onSelect(slice.id);
                setDrag({
                  kind: "move",
                  id: slice.id,
                  grab: { x: point.x - rect.x, y: point.y - rect.y },
                  position: slice.position,
                  box: frame,
                });
              }}
            />
            <line
              x1={corners.topLeft.x}
              y1={corners.topLeft.y}
              x2={corners.topRight.x}
              y2={corners.topRight.y}
              strokeWidth={3}
              className="pointer-events-none stroke-amber-400"
              vectorEffect="non-scaling-stroke"
            >
              <title>Top of the Display rectangle</title>
            </line>
            <text
              x={rect.x + font * 0.5}
              y={rect.y + font * 1.3}
              fontSize={font}
              className="pointer-events-none fill-foreground"
            >
              {slice.name}
            </text>
            {selected && (
              <circle
                cx={rect.x + rect.width}
                cy={rect.y + rect.height}
                r={font * 0.45}
                aria-label="Scale"
                className="cursor-nwse-resize fill-selection stroke-background"
                vectorEffect="non-scaling-stroke"
                onPointerDown={(event) => {
                  capture(svg, event);
                  setDrag({
                    kind: "scale",
                    id: slice.id,
                    scale: slice.scale,
                    box: frame,
                  });
                }}
              />
            )}
          </g>
        );
      })}
    </SlicePane>
  );
}
