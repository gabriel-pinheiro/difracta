import type { DisplaySize, Slice, SliceRect } from "./document.ts";
import { placedRect, type PixelRect } from "./slices.ts";

/**
 * Where a Slice created without a rectangle goes: the largest rectangle of
 * the Display Frame no Slice covers (exactly the remaining space when that
 * is a rectangle), or, with the frame full, its top-left quarter, which
 * then overlaps and is flagged until moved.
 */
export function newSliceRect(
  size: DisplaySize,
  slices: readonly Slice[],
): SliceRect {
  return (
    largestFreeRect(size, slices) ?? {
      x: 0,
      y: 0,
      width: Math.ceil(size.width / 2),
      height: Math.ceil(size.height / 2),
    }
  );
}

/**
 * The largest empty rectangle of the Display Frame, topmost then leftmost
 * among equals; undefined when Slices cover all of it. The frame is cut
 * along every Slice edge into cells, so a few Slices make a small grid.
 */
export function largestFreeRect(
  size: DisplaySize,
  slices: readonly Slice[],
): SliceRect | undefined {
  const clampX = (x: number) => Math.min(size.width, Math.max(0, x));
  const clampY = (y: number) => Math.min(size.height, Math.max(0, y));
  const xs = edges(size.width, slices, (s) => [
    clampX(s.rect.x),
    clampX(s.rect.x + s.rect.width),
  ]);
  const ys = edges(size.height, slices, (s) => [
    clampY(s.rect.y),
    clampY(s.rect.y + s.rect.height),
  ]);
  const columns = xs.length - 1;
  const rows = ys.length - 1;
  const free = (column: number, row: number): boolean => {
    const x = xs[column] ?? 0;
    const y = ys[row] ?? 0;
    return !slices.some(
      (s) =>
        s.rect.x <= x &&
        x < s.rect.x + s.rect.width &&
        s.rect.y <= y &&
        y < s.rect.y + s.rect.height,
    );
  };
  let best: SliceRect | undefined;
  let bestArea = 0;
  for (let left = 0; left < columns; left++) {
    const open = Array.from({ length: rows }, () => true);
    for (let right = left; right < columns; right++) {
      for (let row = 0; row < rows; row++)
        open[row] = open[row] === true && free(right, row);
      const width = (xs[right + 1] ?? 0) - (xs[left] ?? 0);
      let top = 0;
      for (let row = 0; row <= rows; row++) {
        if (row < rows && open[row] === true) continue;
        if (row > top) {
          const height = (ys[row] ?? 0) - (ys[top] ?? 0);
          const area = width * height;
          const y = ys[top] ?? 0;
          const x = xs[left] ?? 0;
          if (
            area > bestArea ||
            (area === bestArea &&
              best !== undefined &&
              (y < best.y || (y === best.y && x < best.x)))
          ) {
            bestArea = area;
            best = { x, y, width, height };
          }
        }
        top = row + 1;
      }
    }
  }
  return best;
}

function edges(
  length: number,
  slices: readonly Slice[],
  of: (slice: Slice) => readonly number[],
): readonly number[] {
  return [...new Set([0, length, ...slices.flatMap(of)])].sort((a, b) => a - b);
}

/**
 * Where a new Slice sits on stage: where it sits in the Display Frame,
 * unless a placed Slice already covers that spot, then just right of the
 * Projection Frame, so it never hides under a panel.
 */
export function newSlicePosition(
  rect: SliceRect,
  slices: readonly Slice[],
  frame: PixelRect | undefined,
): { readonly x: number; readonly y: number } {
  const own = placedRect({ rect, position: rect, rotation: 0, scale: 1 });
  const covered = slices.some((slice) => intersects(placedRect(slice), own));
  if (!covered || frame === undefined) return { x: rect.x, y: rect.y };
  return { x: Math.ceil(frame.x + frame.width), y: Math.floor(frame.y) };
}

function intersects(first: PixelRect, second: PixelRect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}
