import type { Layer } from "@difracta/core";
import { Copy, FolderPlus, Trash2, Ungroup } from "lucide-react";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { CreateItem } from "@/navigator/navigator-row";

import { layerKindLabels } from "./layer-icons";

/**
 * A Layer row's context menu: a Group offers to add into it and to
 * ungroup; any other Layer offers a new Group around it, except a Filter
 * inside a Visual Layer, where a Group cannot go; every Layer duplicates
 * and removes.
 */
export function LayerContextMenu({
  layer,
  nested,
  createItems,
  onCommand,
  onRemove,
}: {
  readonly layer: Layer;
  /** The Layer sits inside a Visual Layer. */
  readonly nested: boolean;
  /** Items for a Group's "Add" entries. */
  readonly createItems: readonly CreateItem[];
  readonly onCommand: (name: string, payload: unknown) => void;
  readonly onRemove: () => void;
}) {
  const group = layer.kind === "group";
  return (
    <ContextMenuContent>
      {group ? (
        <>
          {createItems.map((item) => (
            <ContextMenuItem key={item.label} onClick={item.onSelect}>
              <item.icon /> Add {item.label}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
        </>
      ) : (
        !nested && (
          <ContextMenuItem
            onClick={() => onCommand("layer.group", { layerId: layer.id })}
          >
            <FolderPlus /> New Group with {layerKindLabels[layer.kind]}
          </ContextMenuItem>
        )
      )}
      <ContextMenuItem
        onClick={() => onCommand("layer.duplicate", { layerId: layer.id })}
      >
        <Copy /> Duplicate
      </ContextMenuItem>
      {group && (
        <ContextMenuItem
          onClick={() => onCommand("layer.ungroup", { layerId: layer.id })}
        >
          <Ungroup /> Ungroup
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={onRemove}>
        <Trash2 /> Remove
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
