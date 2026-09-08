import type { Point } from "@difracta/core";
import { useRef, useState } from "react";

import { useLatestWins } from "@/lib/use-latest-wins";
import { cn } from "@/lib/utils";

import { NumberField } from "./number-field";
import { fromPercent, nudgeFromKey, toPercent } from "./points";

/** Width of the space in preview units; height follows the aspect ratio. */
const SPACE_WIDTH = 200;
/** Room around the space, as a fraction of it, for points that overshoot its edge. */
const MARGIN = 0.15;
const HANDLE_RADIUS = 5;

export interface Outline {
  readonly name: string;
  readonly points: readonly Point[];
}

/**
 * A polygon inside a normalized rectangular space (a Projection Frame, a
 * Surface), with draggable handles and one focusable handle per point that
 * takes arrow keys. Positions come from the document except for the point
 * being dragged, which follows the pointer while its sets are throttled to
 * one in flight. Point names label the handles and the coordinate fields.
 */
export function PolygonEditor({
  points,
  names,
  outlines,
  aspect,
  selected,
  onSelect,
  onSet,
  onNudge,
  spaceLabel,
}: {
  readonly points: readonly Point[];
  readonly names: readonly string[];
  /** Other shapes in the same space, drawn dashed for context. */
  readonly outlines: readonly Outline[];
  /** Width of the space divided by its height. */
  readonly aspect: number;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly onSet: (index: number, point: Point) => Promise<unknown>;
  readonly onNudge: (index: number, by: Point) => void;
  readonly spaceLabel: string;
}) {
  const [dragging, setDragging] = useState<
    { index: number; point: Point } | undefined
  >(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const sendSet = useLatestWins(
    ({ index, point }: { index: number; point: Point }) => onSet(index, point),
  );

  const width = SPACE_WIDTH;
  const height = SPACE_WIDTH / aspect;
  const shown =
    dragging === undefined
      ? points
      : points.with(dragging.index, dragging.point);
  const toSpace = (point: Point): Point => ({
    x: point.x * width,
    y: point.y * height,
  });
  const polygon = (shape: readonly Point[]): string =>
    shape
      .map((point) => {
        const { x, y } = toSpace(point);
        return `${String(x)},${String(y)}`;
      })
      .join(" ");

  function pointFromEvent(event: React.PointerEvent): Point | undefined {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (element === null || !matrix) return undefined;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: local.x / width, y: local.y / height };
  }

  function keyDown(index: number, event: React.KeyboardEvent): void {
    const by = nudgeFromKey(event);
    if (by === undefined) return;
    event.preventDefault();
    onNudge(index, by);
  }

  const current = shown[selected] ?? { x: 0, y: 0 };
  const committed = points[selected] ?? current;
  return (
    <div className="grid gap-3">
      <svg
        ref={svg}
        viewBox={`${String(-width * MARGIN)} ${String(-height * MARGIN)} ${String(width * (1 + 2 * MARGIN))} ${String(height * (1 + 2 * MARGIN))}`}
        className="w-full touch-none rounded-md border bg-input/20 select-none"
        aria-label={spaceLabel}
      >
        <rect
          width={width}
          height={height}
          className="fill-background stroke-muted-foreground/40"
          vectorEffect="non-scaling-stroke"
        />
        {outlines.map((outline) => (
          <polygon
            key={outline.name}
            points={polygon(outline.points)}
            className="fill-none stroke-muted-foreground/40"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          >
            <title>{outline.name}</title>
          </polygon>
        ))}
        <polygon
          points={polygon(shown)}
          className="fill-selection/15 stroke-selection"
          vectorEffect="non-scaling-stroke"
        />
        {shown.map((point, index) => {
          const { x, y } = toSpace(point);
          const name = names[index] ?? String(index + 1);
          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r={HANDLE_RADIUS}
                tabIndex={0}
                role="button"
                aria-label={`${name} handle`}
                className={cn(
                  "cursor-move stroke-selection outline-none focus-visible:stroke-2",
                  index === selected ? "fill-selection" : "fill-background",
                )}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onSelect(index);
                  setDragging({ index, point });
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const next = pointFromEvent(event);
                  if (next === undefined) return;
                  setDragging({ index, point: next });
                  sendSet({ index, point: next });
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  setDragging(undefined);
                }}
                onKeyDown={(event) => keyDown(index, event)}
              />
              <text
                x={x + HANDLE_RADIUS + 2}
                y={y - HANDLE_RADIUS}
                className="pointer-events-none fill-muted-foreground font-mono text-[8px]"
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="X"
          unit="%"
          step={0.1}
          value={toPercent(current.x)}
          onCommit={(value) =>
            void onSet(selected, { ...committed, x: fromPercent(value) })
          }
        />
        <NumberField
          label="Y"
          unit="%"
          step={0.1}
          value={toPercent(current.y)}
          onCommit={(value) =>
            void onSet(selected, { ...committed, y: fromPercent(value) })
          }
        />
      </div>
    </div>
  );
}

/** Keyboard handler for a button standing for one point: arrow keys nudge it. */
export function nudgeKeyHandler(
  index: number,
  onNudge: (index: number, by: Point) => void,
): (event: React.KeyboardEvent) => void {
  return (event) => {
    const by = nudgeFromKey(event);
    if (by === undefined) return;
    event.preventDefault();
    onNudge(index, by);
  };
}
