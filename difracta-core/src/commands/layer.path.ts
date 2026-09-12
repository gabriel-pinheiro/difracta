import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

/**
 * Binds a Path to one of the Paths a Visual Layer's Visual declares, by the
 * Visual's key, or clears it with null. The Path must be on the Layer's
 * Target, since the Visual draws it in that Surface's space.
 */
export const layerPath = defineCommand({
  name: "layer.path",
  kind: "authoring",
  description: "Bind a Path to a Layer's Visual, or clear the binding.",
  payload: z
    .object({
      layerId: z.string().min(1),
      key: z.string().min(1),
      pathId: z.string().min(1).nullable(),
    })
    .strict(),
  label: ({ pathId }) => (pathId === null ? "Unbind Path" : "Bind Path"),
  apply({ document, catalog, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    if (layer.kind !== "visual")
      return rejected("Only Visual Layers bind Paths.");
    if (layer.visual === null)
      return rejected(`Layer “${layer.name}” has no Visual to bind a Path to.`);
    const definition = catalog.visual(layer.visual);
    if (
      !definition?.paths?.some((requirement) => requirement.key === payload.key)
    )
      return rejected(
        `${definition?.name ?? layer.visual} declares no Path “${payload.key}”.`,
      );
    if (payload.pathId !== null) {
      const path = document.paths[payload.pathId];
      if (path === undefined)
        return rejected(`Path “${payload.pathId}” does not exist.`);
      if (layer.target === null || path.surfaceId !== layer.target)
        return rejected(
          `Path “${path.name}” is not on the Layer's Target Surface.`,
        );
    }
    const { [payload.key]: current, ...rest } = layer.paths;
    if ((current ?? null) === payload.pathId) return accepted([]);
    const paths =
      payload.pathId === null
        ? rest
        : { ...rest, [payload.key]: payload.pathId };
    return accepted([
      { op: "set", path: ["layers", layer.id, "paths"], value: paths },
    ]);
  },
});
