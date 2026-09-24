import type { DocumentView } from "@difracta/client";
import { generateId, LAYER_KINDS, type LayerKind } from "@difracta/core";

import { useCommand } from "@/lib/client";
import { useBrowser } from "@/library/browser-state";
import { useExpansion } from "@/navigator/expansion";
import type { CreateItem } from "@/navigator/navigator-row";
import { useSelection } from "@/selection/selection";

import { layerIcons, layerKindLabels } from "./layer-icons";

/**
 * Creating Layers from a Scene row or a Group row: one entry per kind for
 * the "+" menu and the context menu. The new Layer is selected and its
 * parent opened so it is in view; a Visual or Filter Layer also opens the
 * Library, since picking is the next thing to do, marked as opened by
 * creation so Escape there removes the untouched Layer again.
 */
export function useLayerActions(view: DocumentView) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const browser = useBrowser();

  function create(
    kind: LayerKind,
    sceneId: string,
    parentId: string | null,
  ): void {
    const id = generateId("layer");
    void command("layer.create", { id, kind, sceneId, parentId }).then(() => {
      setExpanded("scene", sceneId, true);
      if (parentId !== null) setExpanded("layer", parentId, true);
      select({ kind: "layer", id });
      if (kind !== "group") browser.open(id, { created: true });
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
