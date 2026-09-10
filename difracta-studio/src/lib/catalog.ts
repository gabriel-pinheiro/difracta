import type { Definition, FilterLayer, VisualLayer } from "@difracta/core";
import { builtInCatalog, thumbnailFile } from "@difracta/visuals";

/** The Catalog Studio picks from: the same one the runtime validates against. */
export const catalog = builtInCatalog;

/** Thumbnails are served by the runtime next to the live socket. */
export function thumbnailUrl(id: string): string {
  return `/catalog/${thumbnailFile(id)}`;
}

/** What a Layer refers to: its id, and the definition when the Catalog has it. */
export function definitionOf(layer: VisualLayer | FilterLayer): {
  readonly id: string | null;
  readonly definition: Definition | undefined;
} {
  const id = layer.kind === "visual" ? layer.visual : layer.filter;
  return {
    id,
    definition: id === null ? undefined : catalog.definition(layer.kind, id),
  };
}

/** Names for the two catalogs a Layer kind picks from. */
export const pickLabels = {
  visual: { singular: "Visual", plural: "Visuals", command: "layer.visual" },
  filter: { singular: "Filter", plural: "Filters", command: "layer.filter" },
} as const;
