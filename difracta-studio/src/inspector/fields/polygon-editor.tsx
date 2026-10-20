import type { Point } from "@difracta/core";
import { useRef, useState } from "react";

import { useLatestWins } from "@/lib/use-latest-wins";
import { cn } from "@/lib/utils";

import { PointFields } from "./point-fields";
import { nudgeFromKey } from "./points";

/** Width of the space in preview units; height follows the aspect ratio. */
const SPACE_WIDTH = 200;
/** Room around the space, as a fraction of it, for points that overshoot its edge. */
const MARGIN = 0.15;
const HANDLE_RADIUS = 5;

export interface Outline {
  readonly name: string;
  readonly points: readonly Point[];
}

/** The space in pixels, for showing coordinates and nudging in pixels. */
export interface PixelSpace {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a snapping rule needs to know about a drag. */
export interface SnapContext {
  /** Alt held: no snapping. */
  readonly altKey: boolean;
  /** Screen pixels per unit of the space, on each axis. */
  readonly screenPerUnit: Point;
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
  closed = true,
  shapeOf,
  backdrop = [],
  snap,
  pixels,
}: {
  readonly points: readonly Point[];
  readonly names: readonly string[];
  /**
   * The shape to draw for the points as shown (the dragged one following
   * the pointer), when it is not the polygon through them: a Region's
   * rectangle from its two corners.
   */
  readonly shapeOf?: (points: readonly Point[]) => readonly Point[];
  /** Other shapes in the same space, drawn dashed for context. */
  readonly outlines: readonly Outline[];
  /** Width of the space divided by its height. */
  readonly aspect: number;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly onSet: (index: number, point: Point) => Promise<unknown>;
  readonly onNudge: (index: number, by: Point) => void;
  readonly spaceLabel: string;
  /** False draws the shape as a line from the first point to the last, unfilled. */
  readonly closed?: boolean;
  /** Shapes drawn faintly under everything, such as an Output's Slices. */
  readonly backdrop?: readonly Outline[] | undefined;
  /** Where a dragged point lands, given where the pointer is. */
  readonly snap?: ((point: Point, context: SnapContext) => Point) | undefined;
  /** When given, coordinates show in these pixels and arrow keys move by one. */
  readonly pixels?: PixelSpace | undefined;
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
    const point = { x: local.x / width, y: local.y / height };
    return snap === undefined
      ? point
      : snap(point, {
          altKey: event.altKey,
          screenPerUnit: { x: matrix.a * width, y: matrix.d * height },
        });
  }

  const pixel = pixels === undefined ? undefined : pixelStep(pixels);
  function keyDown(index: number, event: React.KeyboardEvent): void {
    const by = nudgeFromKey(event, pixel);
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
        {backdrop.map((shape) => (
          <polygon
            key={shape.name}
            points={polygon(shape.points)}
            className="fill-muted/50 stroke-muted-foreground/30"
            vectorEffect="non-scaling-stroke"
          >
            <title>{shape.name}</title>
          </polygon>
        ))}
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
        {closed ? (
          <polygon
            points={polygon(shapeOf?.(shown) ?? shown)}
            className="fill-selection/15 stroke-selection"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <polyline
            points={polygon(shown)}
            className="fill-none stroke-selection"
            vectorEffect="non-scaling-stroke"
          />
        )}
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
                onFocus={() => onSelect(index)}
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
      <PointFields
        point={current}
        pixels={pixels}
        onCommit={(next) => void onSet(selected, { ...committed, ...next })}
      />
    </div>
  );
}

/** One pixel of a pixel space, as a fraction of it on each axis. */
export function pixelStep(pixels: PixelSpace): Point {
  return { x: 1 / pixels.width, y: 1 / pixels.height };
}

/** Keyboard handler for a button standing for one point: arrow keys nudge it, by a pixel with `pixel`. */
export function nudgeKeyHandler(
  index: number,
  onNudge: (index: number, by: Point) => void,
  pixel?: Point,
): (event: React.KeyboardEvent) => void {
  return (event) => {
    const by = nudgeFromKey(event, pixel);
    if (by === undefined) return;
    event.preventDefault();
    onNudge(index, by);
  };
}
