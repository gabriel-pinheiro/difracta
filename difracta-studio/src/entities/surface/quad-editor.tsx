import {
  CORNERS,
  type CornerName,
  type Point,
  type Quad,
} from "@difracta/core";
import { useRef, useState } from "react";

import { NumberField } from "@/inspector/fields/number-field";
import { useLatestWins } from "@/lib/use-latest-wins";
import { cn } from "@/lib/utils";

import {
  cornerLabels,
  cornerShortLabels,
  fromPercent,
  nudgeFromKey,
  toPercent,
} from "./corners";

/** Width of the Projection Frame in preview units; height follows the aspect ratio. */
const FRAME_WIDTH = 200;
/** Room around the frame, as a fraction of it, for corners that overshoot the projector. */
const MARGIN = 0.15;
const HANDLE_RADIUS = 5;

export interface QuadOutline {
  readonly name: string;
  readonly corners: Quad;
}

/**
 * The Surface's quad inside its Output's Projection Frame, with draggable
 * corner handles, one button per corner for keyboard nudging, and the
 * selected corner's coordinates as percentages of the frame.
 *
 * Positions come from the document except for the corner being dragged,
 * which follows the pointer while its sets are throttled to one in flight.
 */
export function QuadEditor({
  corners,
  others,
  aspect,
  onSet,
  onNudge,
}: {
  readonly corners: Quad;
  /** Other Surfaces on the same Output, drawn as outlines for context. */
  readonly others: readonly QuadOutline[];
  /** Projection Frame width divided by height. */
  readonly aspect: number;
  readonly onSet: (corner: CornerName, point: Point) => Promise<unknown>;
  readonly onNudge: (corner: CornerName, by: Point) => void;
}) {
  const [selected, setSelected] = useState<CornerName>("topLeft");
  const [dragging, setDragging] = useState<
    { corner: CornerName; point: Point } | undefined
  >(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const buttons = useRef(new Map<CornerName, HTMLButtonElement>());
  const sendSet = useLatestWins(
    ({ corner, point }: { corner: CornerName; point: Point }) =>
      onSet(corner, point),
  );

  const width = FRAME_WIDTH;
  const height = FRAME_WIDTH / aspect;
  const shown: Quad =
    dragging === undefined
      ? corners
      : { ...corners, [dragging.corner]: dragging.point };
  const toFrame = (point: Point): Point => ({
    x: point.x * width,
    y: point.y * height,
  });
  const polygon = (quad: Quad): string =>
    CORNERS.map((corner) => {
      const { x, y } = toFrame(quad[corner]);
      return `${String(x)},${String(y)}`;
    }).join(" ");

  function pointFromEvent(event: React.PointerEvent): Point | undefined {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (element === null || !matrix) return undefined;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: local.x / width, y: local.y / height };
  }

  function selectCorner(corner: CornerName): void {
    setSelected(corner);
    buttons.current.get(corner)?.focus();
  }

  function keyDown(corner: CornerName, event: React.KeyboardEvent): void {
    const by = nudgeFromKey(event);
    if (by === undefined) return;
    event.preventDefault();
    onNudge(corner, by);
  }

  const point = shown[selected];
  return (
    <div className="grid gap-3">
      <svg
        ref={svg}
        viewBox={`${String(-width * MARGIN)} ${String(-height * MARGIN)} ${String(width * (1 + 2 * MARGIN))} ${String(height * (1 + 2 * MARGIN))}`}
        className="w-full touch-none rounded-md border bg-input/20 select-none"
        aria-label="Surface corners in the Output's frame"
      >
        <rect
          width={width}
          height={height}
          className="fill-background stroke-muted-foreground/40"
          vectorEffect="non-scaling-stroke"
        />
        {others.map((other) => (
          <polygon
            key={other.name}
            points={polygon(other.corners)}
            className="fill-none stroke-muted-foreground/40"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          >
            <title>{other.name}</title>
          </polygon>
        ))}
        <polygon
          points={polygon(shown)}
          className="fill-selection/15 stroke-selection"
          vectorEffect="non-scaling-stroke"
        />
        {CORNERS.map((corner) => {
          const { x, y } = toFrame(shown[corner]);
          const active = corner === selected;
          return (
            <g key={corner}>
              <circle
                cx={x}
                cy={y}
                r={HANDLE_RADIUS}
                tabIndex={0}
                role="button"
                aria-label={`${cornerLabels[corner]} corner`}
                className={cn(
                  "cursor-move stroke-selection outline-none focus-visible:stroke-2",
                  active ? "fill-selection" : "fill-background",
                )}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelected(corner);
                  setDragging({ corner, point: corners[corner] });
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const next = pointFromEvent(event);
                  if (next === undefined) return;
                  setDragging({ corner, point: next });
                  sendSet({ corner, point: next });
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  setDragging(undefined);
                  selectCorner(corner);
                }}
                onKeyDown={(event) => keyDown(corner, event)}
              />
              <text
                x={x + HANDLE_RADIUS + 2}
                y={y - HANDLE_RADIUS}
                className="pointer-events-none fill-muted-foreground font-mono text-[8px]"
              >
                {cornerShortLabels[corner]}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className="grid grid-cols-2 gap-1"
        role="radiogroup"
        aria-label="Corner"
      >
        {CORNERS.map((corner) => (
          <button
            key={corner}
            type="button"
            ref={(element) => {
              if (element === null) buttons.current.delete(corner);
              else buttons.current.set(corner, element);
            }}
            role="radio"
            aria-checked={corner === selected}
            title="Arrow keys move the corner; Shift for larger, Ctrl for finer steps"
            className={cn(
              "h-6 rounded-md border text-xs focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
              corner === selected
                ? "border-selection bg-selection/15"
                : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              corner === "bottomRight" && "order-last",
            )}
            onClick={() => setSelected(corner)}
            onKeyDown={(event) => keyDown(corner, event)}
          >
            {cornerLabels[corner]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="X"
          unit="%"
          step={0.1}
          value={toPercent(point.x)}
          onCommit={(value) =>
            void onSet(selected, {
              ...corners[selected],
              x: fromPercent(value),
            })
          }
        />
        <NumberField
          label="Y"
          unit="%"
          step={0.1}
          value={toPercent(point.y)}
          onCommit={(value) =>
            void onSet(selected, {
              ...corners[selected],
              y: fromPercent(value),
            })
          }
        />
      </div>
    </div>
  );
}
