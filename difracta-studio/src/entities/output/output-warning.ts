import {
  isEnabledOn,
  type Output,
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
): number {
  return Object.keys(outputs).filter((id) => outputWithoutSurface(id, surfaces))
    .length;
}
