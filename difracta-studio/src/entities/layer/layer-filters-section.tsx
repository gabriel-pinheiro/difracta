import type { DocumentView } from "@difracta/client";
import { childLayers, type Layer, type Table } from "@difracta/core";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InspectorSection } from "@/inspector/fields/inspector-section";
import { useDocumentPath } from "@/lib/client";
import { useRemoveEntity } from "@/selection/remove-selection";
import { useSelection } from "@/selection/selection";

import { useLayerActions } from "./use-layer-actions";

/**
 * The Filter Layers inside a Visual Layer, in stack order (top first) as
 * the navigator shows them under the Layer's row: each by name, which
 * selects it (the navigator unfolds the Layer and its inspector opens),
 * with an X that removes it the way the row's menu would. Add creates an
 * empty Filter Layer in the Layer and opens the Library to pick one, as
 * adding a Filter anywhere does. Collapsed until opened; the count shows
 * while it is.
 */
export function LayerFiltersSection({
  view,
  layer,
}: {
  readonly view: DocumentView;
  readonly layer: Layer & { readonly kind: "visual" };
}) {
  const { select } = useSelection();
  const removeEntity = useRemoveEntity();
  const { create } = useLayerActions(view);
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]) ?? {};
  const filters = childLayers(layers, layer.sceneId, layer.id);
  return (
    <InspectorSection
      storageKey="filters"
      label="Filters"
      count={filters.length}
      defaultExpanded={false}
      actions={
        <Button
          variant="ghost"
          size="xs"
          onClick={() => create("filter", layer.sceneId, layer.id)}
        >
          <Plus /> Add Filter
        </Button>
      }
    >
      {filters.length === 0 ? (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          No Filters on this Layer. One added here treats only this Layer's
          picture, inside its Target.
        </p>
      ) : (
        <ul
          className="grid grid-cols-[minmax(0,1fr)] gap-0.5"
          aria-label="Filters"
        >
          {filters.map((filter) => (
            <li
              key={filter.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1"
            >
              <button
                type="button"
                className="min-w-0 truncate py-0.5 text-left text-xs hover:text-foreground"
                title={`Select ${filter.name}`}
                onClick={() => select({ kind: "layer", id: filter.id })}
              >
                {filter.name}
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${filter.name}`}
                title="Remove"
                onClick={() => removeEntity("layer", filter.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </InspectorSection>
  );
}
