import type { DocumentView } from "@difracta/client";
import type { Layer, Path, Table } from "@difracta/core";
import { useCallback, useSyncExternalStore } from "react";

import { definitionOf } from "@/lib/catalog";

import { layerWarningCount, type LayerWarningContext } from "./layer-warning";

/** What `layerWarning` reads besides the Layer, from the Catalog and the Installation's Paths. */
export function layerWarningContext(
  paths: Table<Path>,
): (layer: Layer) => LayerWarningContext {
  return (layer) => ({
    definition:
      layer.kind === "group" ? undefined : definitionOf(layer).definition,
    paths,
  });
}

/**
 * How many Layer rows warn across the Installation, re-rendering only when
 * the count changes rather than on every Layer edit.
 */
export function useLayerWarningCount(view: DocumentView): number {
  const subscribe = useCallback(
    (listener: () => void) => view.revision.subscribe(() => listener()),
    [view],
  );
  return useSyncExternalStore(subscribe, () => {
    const document = view.get();
    return document === undefined
      ? 0
      : layerWarningCount(document.layers, layerWarningContext(document.paths));
  });
}
