import type { Definition, Layer, Path, Table } from "@difracta/core";

/** What keeps a Layer from drawing, as a navigator warning. */
export interface LayerWarning {
  readonly label: string;
  readonly explanation: string;
}

/** What a Visual Layer's Path check reads besides the Layer. */
export interface LayerWarningContext {
  /** The Layer's Visual or Filter from the Catalog, undefined when unknown. */
  readonly definition: Definition | undefined;
  readonly paths: Table<Path>;
}

/**
 * The one warning a Layer's row shows, most fundamental first: No Visual,
 * then No Target, then No Path when the Visual declares a Path that is
 * unbound or bound to a Path off the Target. Groups get none.
 */
export function layerWarning(
  layer: Layer,
  context?: LayerWarningContext,
): LayerWarning | undefined {
  if (layer.kind === "visual") {
    if (layer.visual === null)
      return {
        label: "No Visual",
        explanation:
          "This Layer draws nothing until a Visual is picked from the Library.",
      };
    if (layer.target === null)
      return {
        label: "No Target",
        explanation:
          "This Layer renders nowhere. Pick a Target in the inspector.",
      };
    const definition = context?.definition;
    if (definition?.kind === "visual" && context !== undefined) {
      const missing = (definition.paths ?? []).some((requirement) => {
        const pathId = layer.paths[requirement.key];
        const path = pathId === undefined ? undefined : context.paths[pathId];
        return path?.surfaceId !== layer.target;
      });
      if (missing)
        return {
          label: "No Path",
          explanation: `${definition.name} follows a Path. Bind one in the inspector, or press + there to create it on the Target.`,
        };
    }
  }
  if (layer.kind === "filter" && layer.filter === null)
    return {
      label: "No Filter",
      explanation:
        "This Layer does nothing until a Filter is picked from the Library.",
    };
  return undefined;
}
