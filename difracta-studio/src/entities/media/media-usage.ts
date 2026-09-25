import {
  orderedEntries,
  type Catalog,
  type Document,
  type FilterLayer,
  type VisualLayer,
} from "@difracta/core";

/** One Layer whose media Parameter holds a Media item, with that Parameter's label. */
export interface MediaUse {
  readonly layer: VisualLayer | FilterLayer;
  readonly parameter: string;
  readonly label: string;
}

/**
 * The Layers showing a Media item: a scan of the Layers whose definition the
 * Catalog knows, since only the definition says which Parameter is a media
 * one. In navigator order.
 */
export function layersUsing(
  document: Pick<Document, "layers">,
  catalog: Catalog,
  mediaId: string,
): readonly MediaUse[] {
  const uses: MediaUse[] = [];
  for (const layer of orderedEntries(document.layers)) {
    if (layer.kind === "group") continue;
    const id = layer.kind === "visual" ? layer.visual : layer.filter;
    const definition =
      id === null ? undefined : catalog.definition(layer.kind, id);
    if (definition === undefined) continue;
    for (const [name, parameter] of Object.entries(definition.parameters)) {
      if (parameter.kind !== "media") continue;
      if (layer.parameters[name] === mediaId)
        uses.push({ layer, parameter: name, label: parameter.label });
    }
  }
  return uses;
}
