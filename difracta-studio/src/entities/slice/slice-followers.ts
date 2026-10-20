import {
  orderedEntries,
  type SliceRect,
  type Surface,
  type Table,
} from "@difracta/core";

/** The Surfaces whose mapping on the Slice's Output follows it, in Surface order. */
export function followersOf(
  surfaces: Table<Surface>,
  slice: { readonly id: string; readonly outputId: string },
): readonly Surface[] {
  return orderedEntries(surfaces).filter((surface) => {
    const follow = surface.mappings[slice.outputId]?.follow;
    return (
      follow !== undefined && "slice" in follow && follow.slice === slice.id
    );
  });
}

/** Whether a Display rectangle reaches past a Display Frame of `size`. */
export function pastDisplay(
  rect: SliceRect,
  size: { readonly width: number; readonly height: number } | null,
): boolean {
  return (
    size !== null &&
    (rect.x + rect.width > size.width || rect.y + rect.height > size.height)
  );
}
