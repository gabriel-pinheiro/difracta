import type { DocumentView } from "@difracta/client";
import { LAYER_KINDS, type LayerKind } from "@difracta/core";

import { useCommand } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import type { CreateItem } from "@/navigator/navigator-row";
import { useSelection } from "@/selection/selection";

import { layerIcons, layerKindLabels } from "./layer-icons";

function generateLayerId(): string {
  return `layer_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/**
 * Creating Layers from a Scene row or a Group row: one entry per kind for
 * the "+" menu and the context menu. The new Layer is selected and its
 * parent opened so it is in view.
 */
export function useLayerActions(view: DocumentView) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();

  function create(
    kind: LayerKind,
    sceneId: string,
    parentId: string | null,
  ): void {
    const id = generateLayerId();
    void command("layer.create", { id, kind, sceneId, parentId }).then(() => {
      setExpanded("scene", sceneId, true);
      if (parentId !== null) setExpanded("layer", parentId, true);
      select({ kind: "layer", id });
    });
  }

  function createItems(
    sceneId: string,
    parentId: string | null,
  ): readonly CreateItem[] {
    return LAYER_KINDS.map((kind) => ({
      label: layerKindLabels[kind],
      icon: layerIcons[kind],
      onSelect: () => create(kind, sceneId, parentId),
    }));
  }

  return { create, createItems };
}
