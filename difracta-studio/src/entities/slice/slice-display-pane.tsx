import {
  displayOverlaps,
  overlappingSlice,
  type DisplaySize,
  type Slice,
  type SliceRect,
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
import {
  CORNER_HANDLES,
  displayTargets,
  EDGE_HANDLES,
  snapDraw,
  snapMove,
  snapResize,
  type ResizeHandle,
} from "./slice-snap";

const EDGE_CURSORS = {
  top: "cursor-ns-resize",
  bottom: "cursor-ns-resize",
  left: "cursor-ew-resize",
  right: "cursor-ew-resize",
} as const;

const CORNER_CURSORS = {
  topLeft: "cursor-nwse-resize",
  bottomRight: "cursor-nwse-resize",
  topRight: "cursor-nesw-resize",
  bottomLeft: "cursor-nesw-resize",
} as const;

type Drag =
  | {
      readonly kind: "move";
      readonly id: string;
      readonly grab: { readonly x: number; readonly y: number };
      readonly rect: SliceRect;
    }
  | {
      readonly kind: "resize";
      readonly id: string;
      readonly handle: ResizeHandle;
      readonly rect: SliceRect;
    }
  | {
      readonly kind: "draw";
      readonly start: { readonly x: number; readonly y: number };
      readonly rect: SliceRect;
    };

/**
 * The Display Frame at the processor's pixel size with the Output's Slices
 * as rectangles: drag one to move it, its corners or sides to resize it,
 * empty space to draw a new one. Everything stays inside the frame. Edges
 * snap to whole pixels, the frame's edges and the other Slices' edges; Alt
 * turns the edge snapping off. Slices may overlap while being arranged;
 * overlapping ones are outlined red.
 */
export function SliceDisplayPane({
  size,
  slices,
  selectedId,
  onSelect,
  onRect,
  onDraw,
}: {
  readonly size: DisplaySize;
  readonly slices: readonly Slice[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  /** A dragged Slice's new rectangle; sends coalesce per Slice. */
  readonly onRect: (id: string, rect: SliceRect) => void;
  /** A rectangle drawn on empty space, for a new Slice. */
  readonly onDraw: (rect: SliceRect) => void;
}) {
  const svg = usePaneRef();
  const pointer = (event: ReactPointerEvent) => panePoint(svg, event);
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  const box = { x: 0, y: 0, width: size.width, height: size.height };
  const font = labelSize(box);
  const draggedId = drag?.kind === "draw" ? undefined : drag?.id;
  const others = (id: string | undefined) =>
    slices.filter((slice) => slice.id !== id);
  const shown = slices.map((slice) =>
    drag !== undefined && drag.kind !== "draw" && drag.id === slice.id
      ? { ...slice, rect: drag.rect }
      : slice,
  );
  const overlaps = displayOverlaps(shown);
  const drawOverlaps =
    drag?.kind === "draw" && overlappingSlice(slices, drag.rect) !== undefined;

  function move(event: ReactPointerEvent): void {
    if (drag === undefined) return;
    const point = pointer(event);
    if (point === undefined) return;
    const targets = displayTargets(size, others(draggedId));
    const threshold = snapThreshold(event, point);
    let rect: SliceRect;
    if (drag.kind === "move") {
      const at = snapMove(
        drag.rect,
        point.x - drag.grab.x,
        point.y - drag.grab.y,
        targets,
        threshold,
        size,
      );
      rect = { ...drag.rect, ...at };
    } else if (drag.kind === "resize") {
      rect = snapResize(
        drag.rect,
        drag.handle,
        point,
        targets,
        threshold,
        size,
      );
    } else {
      rect = snapDraw(drag.start, point, targets, threshold, size);
    }
    setDrag({ ...drag, rect });
    if (drag.kind !== "draw") onRect(drag.id, rect);
  }

  function up(event: ReactPointerEvent<SVGSVGElement>): void {
    if (svg.current?.hasPointerCapture(event.pointerId) === true)
      svg.current.releasePointerCapture(event.pointerId);
    if (drag?.kind === "draw" && drag.rect.width > 1 && drag.rect.height > 1)
      onDraw(drag.rect);
    setDrag(undefined);
  }

  return (
    <SlicePane
      title="Display Frame: the processor's input map"
      caption={`${String(size.width)}×${String(size.height)} px · New Slice, or drag on empty space · Alt: no snapping`}
      box={box}
      svgRef={svg}
      onPointerDown={(event) => {
        const point = pointer(event);
        if (point === undefined) return;
        const start = {
          x: Math.min(size.width - 1, Math.max(0, Math.round(point.x))),
          y: Math.min(size.height - 1, Math.max(0, Math.round(point.y))),
        };
        capture(svg, event);
        setDrag({
          kind: "draw",
          start,
          rect: { ...start, width: 1, height: 1 },
        });
      }}
      onPointerMove={move}
      onPointerUp={up}
    >
      <rect
        {...box}
        className="fill-background stroke-muted-foreground/60"
        vectorEffect="non-scaling-stroke"
      />
      {shown.map((slice) => {
        const rect = slice.rect;
        const selected = slice.id === selectedId;
        const overlapping = overlaps.has(slice.id);
        return (
          <g key={slice.id}>
            <rect
              {...rect}
              className={cn(
                "cursor-move",
                selected
                  ? "fill-selection/25 stroke-selection"
                  : "fill-muted/60 stroke-muted-foreground",
                overlapping && "fill-destructive/20 stroke-destructive",
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
                  rect,
                });
              }}
            />
            <text
              x={rect.x + font * 0.5}
              y={rect.y + font * 1.3}
              fontSize={font}
              className="pointer-events-none fill-foreground"
            >
              {slice.name}
            </text>
            {selected &&
              EDGE_HANDLES.map((handle) => (
                <rect
                  key={handle}
                  {...edgeStrip(rect, handle, font * 0.5)}
                  aria-label={`Resize from the ${handle} edge`}
                  className={cn("fill-transparent", EDGE_CURSORS[handle])}
                  onPointerDown={(event) => {
                    capture(svg, event);
                    setDrag({ kind: "resize", id: slice.id, handle, rect });
                  }}
                />
              ))}
            {selected &&
              CORNER_HANDLES.map((handle) => (
                <circle
                  key={handle}
                  cx={handle.endsWith("Left") ? rect.x : rect.x + rect.width}
                  cy={handle.startsWith("top") ? rect.y : rect.y + rect.height}
                  r={font * 0.45}
                  aria-label={`Resize from ${handle}`}
                  className={cn(
                    "fill-selection stroke-background",
                    CORNER_CURSORS[handle],
                  )}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(event) => {
                    capture(svg, event);
                    setDrag({ kind: "resize", id: slice.id, handle, rect });
                  }}
                />
              ))}
          </g>
        );
      })}
      {drag?.kind === "draw" && (
        <rect
          {...drag.rect}
          className={cn(
            "pointer-events-none fill-selection/15 stroke-selection",
            drawOverlaps && "fill-destructive/20 stroke-destructive",
          )}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </SlicePane>
  );
}

/** The hit strip along one side of a rectangle, `thickness` across, centred on the edge. */
function edgeStrip(
  rect: SliceRect,
  edge: "top" | "right" | "bottom" | "left",
  thickness: number,
): SliceRect {
  const half = thickness / 2;
  switch (edge) {
    case "top":
      return {
        x: rect.x,
        y: rect.y - half,
        width: rect.width,
        height: thickness,
      };
    case "bottom":
      return {
        x: rect.x,
        y: rect.y + rect.height - half,
        width: rect.width,
        height: thickness,
      };
    case "left":
      return {
        x: rect.x - half,
        y: rect.y,
        width: thickness,
        height: rect.height,
      };
    case "right":
      return {
        x: rect.x + rect.width - half,
        y: rect.y,
        width: thickness,
        height: rect.height,
      };
  }
}
