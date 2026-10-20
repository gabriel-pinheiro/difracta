import {
  displayOverlaps,
  isEnabledOn,
  outputSlices,
  type DisplaySize,
  type Output,
  type Slice,
  type Surface,
  type Table,
} from "@difracta/core";

/** Whether no Surface is on the Output: its row's "No Surface". */
export function outputWithoutSurface(
  outputId: string,
  surfaces: Table<Surface>,
): boolean {
  return !Object.values(surfaces).some((surface) =>
    isEnabledOn(surface, outputId),
  );
}

/** How many Output rows warn, for the collapsed Outputs section. */
export function outputWarningCount(
  outputs: Table<Output>,
  surfaces: Table<Surface>,
  slices: Table<Slice> = {},
): number {
  return Object.keys(outputs).filter(
    (id) =>
      outputWithoutSurface(id, surfaces) ||
      sliceOverlapWarning(slices, id) !== undefined,
  ).length;
}

/**
 * What an Output's card and row say while two of its Slices overlap in the
 * Display Frame, naming each overlapping pair; undefined when none do. A
 * processor pixel has one source, so the later Slice wins there.
 */
export function sliceOverlapWarning(
  slices: Table<Slice>,
  outputId: string,
): string | undefined {
  const own = outputSlices(slices, outputId);
  const overlaps = displayOverlaps(own);
  const pairs: string[] = [];
  for (const [index, slice] of own.entries())
    for (const other of overlaps.get(slice.id) ?? [])
      if (own.indexOf(other) > index)
        pairs.push(`${slice.name} and ${other.name}`);
  if (pairs.length === 0) return undefined;
  return `Slices overlap in the Display Frame: ${pairs.join(", ")}. The later Slice shows where they do.`;
}

/**
 * The size an Output Session draws at when it is not the Display Frame a
 * sliced Output's Slices were drawn for, so the map is scaled to fit and
 * may land off the processor's pixels; undefined when they match, when the
 * Output has no Slices or no Display size, or when nothing reports.
 */
export function sliceSizeMismatch(
  output: Pick<Output, "displaySize">,
  sliced: boolean,
  reported: DisplaySize | null | undefined,
): DisplaySize | undefined {
  const size = output.displaySize;
  if (!sliced || size === null || reported == null) return undefined;
  return reported.width === size.width && reported.height === size.height
    ? undefined
    : { width: reported.width, height: reported.height };
}
