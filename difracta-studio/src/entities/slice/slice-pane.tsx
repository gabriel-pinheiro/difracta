import type { PixelRect } from "@difracta/core";
import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

/** How close, in screen pixels, an edge comes before it snaps. */
export const SNAP_SCREEN_PX = 6;
/** Room around the shown box, as a fraction of its longer side. */
const MARGIN = 0.06;

/** A pointer position in the pane's pixels, and how many of them one screen pixel spans. */
export interface PanePoint {
  readonly x: number;
  readonly y: number;
  readonly perScreenPixel: number;
}

/** A pointer event on the pane's SVG in its own pixel space. */
export function panePoint(
  svg: RefObject<SVGSVGElement | null>,
  event: ReactPointerEvent,
): PanePoint | undefined {
  const matrix = svg.current?.getScreenCTM();
  if (!matrix) return undefined;
  const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    matrix.inverse(),
  );
  return { x: local.x, y: local.y, perScreenPixel: 1 / matrix.a };
}

/** The snapping distance for a pointer event, none while Alt is held. */
export function snapThreshold(
  event: { readonly altKey: boolean },
  point: PanePoint,
): number {
  return event.altKey ? 0 : SNAP_SCREEN_PX * point.perScreenPixel;
}

/**
 * One pane of the Slice editor: an SVG in pixel units showing `box` with
 * room around it, filling its column, with the pane's title and a caption
 * under it. Pointer moves and ups anywhere on it go to the pane's handlers,
 * so a drag continues past the shapes.
 */
export function SlicePane({
  title,
  caption,
  box,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  children,
}: {
  readonly title: string;
  readonly caption: ReactNode;
  readonly box: PixelRect;
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly children: ReactNode;
}) {
  const margin = Math.max(box.width, box.height) * MARGIN;
  const viewBox = [
    box.x - margin,
    box.y - margin,
    box.width + 2 * margin,
    box.height + 2 * margin,
  ].join(" ");
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="size-full touch-none rounded-md border bg-input/20 select-none"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </svg>
      <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
        {caption}
      </p>
    </section>
  );
}

/** Captures the pointer on the pane's SVG, so the drag follows it everywhere. */
export function capture(
  svg: RefObject<SVGSVGElement | null>,
  event: ReactPointerEvent,
): void {
  event.preventDefault();
  event.stopPropagation();
  svg.current?.setPointerCapture(event.pointerId);
}

/** A stable ref holder for the pane SVG. */
export function usePaneRef(): RefObject<SVGSVGElement | null> {
  return useRef<SVGSVGElement>(null);
}

/** Font size for labels in a pane showing `box`: readable at any frame size. */
export function labelSize(box: PixelRect): number {
  return Math.max(box.width, box.height) / 45;
}
