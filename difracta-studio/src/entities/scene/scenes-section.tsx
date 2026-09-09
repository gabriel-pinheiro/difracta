import type { DocumentView } from "@difracta/client";
import { orderedEntries, type Scene, type Table } from "@difracta/core";
import { Clapperboard, Copy, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LayerRows } from "@/entities/layer/layer-rows";
import { useLayerActions } from "@/entities/layer/use-layer-actions";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { NavigatorRow, RowAction } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

function generateSceneId(): string {
  return `scene_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/**
 * Navigator section listing the Scenes, each opening to its Layers. The
 * active Scene carries a green dot; Play cuts the Outputs to a Scene without
 * selecting it, and selecting a Scene never plays it.
 */
export function ScenesSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const { createItems } = useLayerActions(view);
  const scenes = useDocumentPath<Table<Scene>>(view, ["scenes"]) ?? {};
  const activeScene = useDocumentPath<string | null>(view, [
    "installation",
    "activeScene",
  ]);
  const [naming, setNaming] = useState(false);
  const ordered = orderedEntries(scenes);

  function create(name: string): void {
    const id = generateSceneId();
    void command("scene.create", { id, name }).then(() => {
      select({ kind: "scene", id });
    });
  }

  return (
    <>
      <NavigatorSection
        storageKey="scene"
        label="Scenes"
        empty={
          ordered.length === 0 ? "No Scenes. Press + to add one." : undefined
        }
        onCreate={() => setNaming(true)}
      >
        <SortableList
          kind="scene"
          ids={ordered.map((scene) => scene.id)}
          selectedId={selection?.kind === "scene" ? selection.id : undefined}
          onMove={(id, after) =>
            void command("entity.move", { table: "scenes", id, after })
          }
        >
          {ordered.map((scene) => {
            const active = scene.id === activeScene;
            const expanded = isExpanded("scene", scene.id);
            const items = createItems(scene.id, null);
            return (
              <SortableItem
                key={scene.id}
                id={scene.id}
                inside={{
                  kinds: ["layer"],
                  onDrop: (layerId) =>
                    void command("layer.move", {
                      layerId,
                      sceneId: scene.id,
                      parentId: null,
                      after: null,
                    }),
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <NavigatorRow
                      icon={Clapperboard}
                      label={scene.name}
                      selected={isSelected(selection, "scene", scene.id)}
                      expanded={expanded}
                      onToggle={(next) => setExpanded("scene", scene.id, next)}
                      onSelect={() => select({ kind: "scene", id: scene.id })}
                      createItems={items}
                      actions={
                        <RowAction
                          label={`Play ${scene.name}`}
                          onClick={() =>
                            void command("scene.play", { sceneId: scene.id })
                          }
                        >
                          <Play className="size-3" />
                        </RowAction>
                      }
                    >
                      {active && (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-emerald-400"
                          title="Active Scene: the Outputs show it"
                        />
                      )}
                    </NavigatorRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    {items.map((item) => (
                      <ContextMenuItem key={item.label} onClick={item.onSelect}>
                        <item.icon /> Add {item.label}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={active}
                      onClick={() =>
                        void command("scene.play", { sceneId: scene.id })
                      }
                    >
                      <Play /> Play
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() =>
                        void command("scene.duplicate", { sceneId: scene.id })
                      }
                    >
                      <Copy /> Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      disabled={active}
                      title={
                        active
                          ? "The active Scene cannot be removed. Play another first."
                          : undefined
                      }
                      onClick={() =>
                        void command("scene.remove", { sceneId: scene.id })
                      }
                    >
                      <Trash2 /> Remove
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {expanded && (
                  <LayerRows
                    view={view}
                    sceneId={scene.id}
                    parentId={null}
                    depth={2}
                  />
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      </NavigatorSection>
      <NameDialog
        request={
          naming
            ? {
                title: "New Scene",
                label: "Name",
                initial: `Scene ${String(ordered.length + 1)}`,
                submitLabel: "Create",
                onSubmit: create,
              }
            : undefined
        }
        onClose={() => setNaming(false)}
      />
    </>
  );
}
