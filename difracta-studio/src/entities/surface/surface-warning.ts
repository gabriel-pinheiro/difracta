import {
  enabledOutputs,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";

/** What a Surface's row says of its Outputs: the name of the only one, or how many. */
export function surfaceOutputsLabel(
  surface: Surface,
  outputs: Table<Output>,
): string | undefined {
  const [first, ...others] = enabledOutputs(surface, outputs);
  if (first === undefined) return undefined;
  return others.length === 0 ? first.name : `${others.length + 1} Outputs`;
}

/** How many Surface rows warn "No Output", for the collapsed Surfaces section. */
export function surfaceWarningCount(
  surfaces: Table<Surface>,
  outputs: Table<Output>,
): number {
  return Object.values(surfaces).filter(
    (surface) => enabledOutputs(surface, outputs).length === 0,
  ).length;
}
