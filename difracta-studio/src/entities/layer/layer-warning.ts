import type { Layer } from "@difracta/core";

/** What keeps a Layer from drawing, as a navigator warning. */
export interface LayerWarning {
  readonly label: string;
  readonly explanation: string;
}

/**
 * The one warning a Layer's row shows, most fundamental first: a Visual
 * Layer missing both its Visual and its Target names only the Visual.
 * Groups get none.
 */
export function layerWarning(layer: Layer): LayerWarning | undefined {
  if (layer.kind === "visual") {
    if (layer.visual === null)
      return {
        label: "no Visual",
        explanation:
          "This Layer draws nothing until a Visual is picked from the Library.",
      };
    if (layer.target === null)
      return {
        label: "no Target",
        explanation:
          "This Layer renders nowhere. Pick a Target in the inspector.",
      };
  }
  if (layer.kind === "filter" && layer.filter === null)
    return {
      label: "no Filter",
      explanation:
        "This Layer does nothing until a Filter is picked from the Library.",
    };
  return undefined;
}
