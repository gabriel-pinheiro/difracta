import type { Output, Surface, Table } from "@difracta/core";

/** The Output the Surface renders through, undefined when it has none or it is gone. */
export function surfaceOutput(
  surface: Surface,
  outputs: Table<Output>,
): Output | undefined {
  return surface.output === null ? undefined : outputs[surface.output];
}

/** How many Surface rows warn "No Output", for the collapsed Surfaces section. */
export function surfaceWarningCount(
  surfaces: Table<Surface>,
  outputs: Table<Output>,
): number {
  return Object.values(surfaces).filter(
    (surface) => surfaceOutput(surface, outputs) === undefined,
  ).length;
}
