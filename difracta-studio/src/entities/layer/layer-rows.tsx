import type { DocumentView } from "@difracta/client";
import {
  childLayers,
  effectiveDocument,
  layerEffectivelyEnabled,
  layerHoldsChildren,
  linkAt,
  type Controller,
  type Layer,
  type Link,
  type Path,
  type Region,
  type Table,
} from "@difracta/core";
import { Eye, EyeOff, Link2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useBrowser } from "@/library/browser-state";
import { useExpansion } from "@/navigator/expansion";
import {
  NavigatorEmptyRow,
  NavigatorRow,
  RowAction,
} from "@/navigator/navigator-row";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { LayerContextMenu } from "./layer-context-menu";
import { layerIcons } from "./layer-icons";
import { layerWarning } from "./layer-warning";
import { layerWarningContext } from "./layer-warning-context";
import { useLayerActions } from "./use-layer-actions";

/** Only a Filter Layer may be dropped inside a Visual Layer. */
const FILTERS_ONLY = ["filter"] as const;

/**
 * The Layers under one Scene root, Group or Visual Layer as rows, topmost
 * first, Groups opening to their own rows and Visual Layers to the Filter
 * Layers they hold. Rows can be dragged among siblings, into a Group (its
 * middle), into a Visual Layer when they are Filter Layers, and to other
 * Scenes. Layers disabled by themselves or by a Group or Visual Layer
 * above show faded; a Layer whose Enabled a Controller drives shows a link
 * glyph in place of the eye, since the eye would not obey.
 */
export function LayerRows({
  view,
  sceneId,
  parentId,
  depth,
}: {
  readonly view: DocumentView;
  readonly sceneId: string;
  readonly parentId: string | null;
  readonly depth: number;
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const { createItems } = useLayerActions(view);
  const browser = useBrowser();
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]) ?? {};
  // Enabled may be linked: dimming follows what the Controllers make of it.
  useDocumentPath<Table<Link>>(view, ["links"]);
  const controllers =
    useDocumentPath<Table<Controller>>(view, ["controllers"]) ?? {};
  // A Visual that follows a Path warns while its Path is missing.
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  const document = view.get();
  const effective =
    document === undefined
      ? layers
      : effectiveDocument(document, catalog).layers;
  const warningContext = layerWarningContext(paths, regions);
  const rows = childLayers(layers, sceneId, parentId);
  const parent = parentId === null ? undefined : layers[parentId];
  const nested = parent?.kind === "visual";
  const childCount = (layer: Layer): number =>
    layerHoldsChildren(layer)
      ? childLayers(layers, sceneId, layer.id).length
      : 0;
  useUnfoldOnGain(rows, childCount, (id) => setExpanded("layer", id, true));
  const moveInto = (layerId: string, target: Layer): void =>
    void command("layer.move", {
      layerId,
      sceneId: target.sceneId,
      parentId: target.id,
      after: null,
    });

  if (rows.length === 0)
    return (
      <NavigatorEmptyRow depth={depth}>
        {parentId === null ? "No Layers yet." : "Empty Group"}
      </NavigatorEmptyRow>
    );
  return (
    <SortableList
      kind="layer"
      listId={`layer:${sceneId}:${parentId ?? ""}`}
      variants={nested ? FILTERS_ONLY : undefined}
      ids={rows.map((layer) => layer.id)}
      selectedId={selection?.kind === "layer" ? selection.id : undefined}
      onMove={(layerId, after) =>
        void command("layer.move", { layerId, sceneId, parentId, after })
      }
    >
      {rows.map((layer) => {
        const Icon = layerIcons[layer.kind];
        const group = layer.kind === "group";
        // A Group always opens; a Visual Layer only while it holds Filters.
        const openable = group || childCount(layer) > 0;
        const expanded = openable && isExpanded("layer", layer.id);
        const shown = effective[layer.id] ?? layer;
        const enabledLink =
          document === undefined
            ? undefined
            : linkAt(document, `layer/${layer.id}/enabled`);
        const enabledBy =
          enabledLink === undefined
            ? undefined
            : controllers[enabledLink.controllerId]?.name;
        const warning = layerWarning(layer, warningContext(layer));
        return (
          <SortableItem
            key={layer.id}
            id={layer.id}
            variant={layer.kind}
            inside={
              group
                ? { kinds: ["layer"], onDrop: (id) => moveInto(id, layer) }
                : layer.kind === "visual"
                  ? {
                      kinds: ["layer"],
                      variants: FILTERS_ONLY,
                      onDrop: (id) => moveInto(id, layer),
                    }
                  : undefined
            }
          >
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  id={layer.id}
                  icon={Icon}
                  label={layer.name}
                  depth={depth}
                  selected={isSelected(selection, "layer", layer.id)}
                  dimmed={!layerEffectivelyEnabled(effective, shown)}
                  expanded={expanded}
                  onToggle={
                    openable
                      ? (next) => setExpanded("layer", layer.id, next)
                      : undefined
                  }
                  onSelect={() => select({ kind: "layer", id: layer.id })}
                  onOpen={
                    group
                      ? undefined
                      : () => {
                          select({ kind: "layer", id: layer.id });
                          browser.open(layer.id);
                        }
                  }
                  createItems={
                    group ? createItems(sceneId, layer.id) : undefined
                  }
                  actions={
                    enabledBy !== undefined ? (
                      <RowAction
                        label={`Enabled controlled by ${enabledBy}, ${shown.enabled ? "on" : "off"}`}
                        active
                        onClick={() => select({ kind: "layer", id: layer.id })}
                      >
                        <Link2 className="size-3 text-selection" />
                      </RowAction>
                    ) : (
                      <RowAction
                        label={
                          layer.enabled
                            ? `Disable ${layer.name}`
                            : `Enable ${layer.name}`
                        }
                        active={!layer.enabled}
                        onClick={() =>
                          void command("layer.update", {
                            layerId: layer.id,
                            enabled: !layer.enabled,
                          })
                        }
                      >
                        {layer.enabled ? (
                          <Eye className="size-3" />
                        ) : (
                          <EyeOff className="size-3" />
                        )}
                      </RowAction>
                    )
                  }
                >
                  {warning !== undefined && (
                    <NavigatorWarning
                      label={warning.label}
                      explanation={warning.explanation}
                    />
                  )}
                </NavigatorRow>
              </ContextMenuTrigger>
              <LayerContextMenu
                layer={layer}
                nested={nested}
                createItems={group ? createItems(sceneId, layer.id) : []}
                onCommand={(name, payload) => void command(name, payload)}
                onRemove={() => removeEntity("layer", layer.id)}
              />
            </ContextMenu>
            {expanded && (
              <LayerRows
                view={view}
                sceneId={sceneId}
                parentId={layer.id}
                depth={depth + 1}
              />
            )}
          </SortableItem>
        );
      })}
    </SortableList>
  );
}

/**
 * Opens a row the moment it gains a child, the first or any later one: a
 * Visual Layer given a Filter from its inspector or by a drop unfolds to
 * show it. Rows start collapsed, so nothing opens on the first render or
 * when the rows come back after their Scene was folded away.
 */
function useUnfoldOnGain(
  rows: readonly Layer[],
  count: (layer: Layer) => number,
  unfold: (id: string) => void,
): void {
  const counts = useRef<ReadonlyMap<string, number> | undefined>(undefined);
  const current = new Map(rows.map((layer) => [layer.id, count(layer)]));
  useEffect(() => {
    const previous = counts.current;
    counts.current = current;
    if (previous === undefined) return;
    for (const [id, now] of current) {
      const before = previous.get(id);
      if (before !== undefined && now > before) unfold(id);
    }
  });
}
