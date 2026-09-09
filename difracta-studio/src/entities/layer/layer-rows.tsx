import type { DocumentView } from "@difracta/client";
import {
  childLayers,
  layerEffectivelyEnabled,
  type Layer,
  type Table,
} from "@difracta/core";
import { Copy, Eye, EyeOff, FolderPlus, Trash2, Ungroup } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import {
  NavigatorEmptyRow,
  NavigatorRow,
  RowAction,
} from "@/navigator/navigator-row";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

import { layerIcons, layerKindLabels } from "./layer-icons";
import { useLayerActions } from "./use-layer-actions";

/**
 * The Layers under one Scene root or Group as rows, topmost first, Groups
 * opening to their own rows. Rows can be dragged among siblings, into a
 * Group (its middle) and to other Scenes. Layers disabled by themselves or
 * by a Group above show faded.
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
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const { createItems } = useLayerActions(view);
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]) ?? {};
  const rows = childLayers(layers, sceneId, parentId);
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
        {parentId === null ? "No Layers" : "Empty Group"}
      </NavigatorEmptyRow>
    );
  return (
    <SortableList
      kind="layer"
      listId={`layer:${sceneId}:${parentId ?? ""}`}
      ids={rows.map((layer) => layer.id)}
      selectedId={selection?.kind === "layer" ? selection.id : undefined}
      onMove={(layerId, after) =>
        void command("layer.move", { layerId, sceneId, parentId, after })
      }
    >
      {rows.map((layer) => {
        const Icon = layerIcons[layer.kind];
        const group = layer.kind === "group";
        const expanded = group && isExpanded("layer", layer.id);
        return (
          <SortableItem
            key={layer.id}
            id={layer.id}
            inside={
              group
                ? { kinds: ["layer"], onDrop: (id) => moveInto(id, layer) }
                : undefined
            }
          >
            <ContextMenu>
              <ContextMenuTrigger>
                <NavigatorRow
                  icon={Icon}
                  label={layer.name}
                  depth={depth}
                  selected={isSelected(selection, "layer", layer.id)}
                  dimmed={!layerEffectivelyEnabled(layers, layer)}
                  expanded={expanded}
                  onToggle={
                    group
                      ? (next) => setExpanded("layer", layer.id, next)
                      : undefined
                  }
                  onSelect={() => select({ kind: "layer", id: layer.id })}
                  createItems={
                    group ? createItems(sceneId, layer.id) : undefined
                  }
                  actions={
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
                  }
                />
              </ContextMenuTrigger>
              <ContextMenuContent>
                {group ? (
                  <>
                    {createItems(sceneId, layer.id).map((item) => (
                      <ContextMenuItem key={item.label} onClick={item.onSelect}>
                        <item.icon /> Add {item.label}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuSeparator />
                  </>
                ) : (
                  <ContextMenuItem
                    onClick={() =>
                      void command("layer.group", { layerId: layer.id })
                    }
                  >
                    <FolderPlus /> New Group with {layerKindLabels[layer.kind]}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  onClick={() =>
                    void command("layer.duplicate", { layerId: layer.id })
                  }
                >
                  <Copy /> Duplicate
                </ContextMenuItem>
                {group && (
                  <ContextMenuItem
                    onClick={() =>
                      void command("layer.ungroup", { layerId: layer.id })
                    }
                  >
                    <Ungroup /> Ungroup
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() =>
                    void command("layer.remove", { layerId: layer.id })
                  }
                >
                  <Trash2 /> Remove
                </ContextMenuItem>
              </ContextMenuContent>
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
