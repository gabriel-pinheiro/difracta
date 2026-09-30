import type { DocumentView } from "@difracta/client";
import {
  childMedia,
  mediaItemTypeIn,
  type Media,
  type Table,
} from "@difracta/core";
import { Trash2, Ungroup } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DisabledHint } from "@/navigator/create-menu";
import { useExpansion } from "@/navigator/expansion";
import {
  NavigatorEmptyRow,
  NavigatorRow,
  type CreateItem,
} from "@/navigator/navigator-row";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { mediaGroupIcon, mediaTypeIcons } from "./media-icons";
import { mediaWarning, type MediaLive } from "./media-status";
import { shareLive } from "./share-slots";
import { describeShare, shareStatusTone } from "./share-status";

/** The Media items under the root or one Group as rows; Groups open onto their own. */
export function MediaRows({
  view,
  parentId,
  depth,
  createItems,
}: {
  readonly view: DocumentView;
  readonly parentId: string | null;
  readonly depth: number;
  readonly createItems: (parentId: string | null) => readonly CreateItem[];
}) {
  const command = useCommand(view);
  const removeEntity = useRemoveEntity();
  const { selection, select } = useSelection();
  const { isExpanded, setExpanded } = useExpansion();
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const rows = childMedia(media, parentId);

  if (rows.length === 0)
    return (
      <NavigatorEmptyRow depth={depth}>
        {parentId === null ? "No Media yet." : "Empty Group"}
      </NavigatorEmptyRow>
    );
  return (
    <SortableList
      kind="media"
      listId={`media:${parentId ?? ""}`}
      ids={rows.map((item) => item.id)}
      selectedId={selection?.kind === "media" ? selection.id : undefined}
      onMove={(mediaId, after) =>
        void command("media.move", { mediaId, parentId, after })
      }
    >
      {rows.map((item) => {
        const group = item.kind === "group";
        const expanded = group && isExpanded("media", item.id);
        const remove = (
          <ContextMenuItem
            variant="destructive"
            onClick={() => removeEntity("media", item.id)}
          >
            <Trash2 /> Remove
          </ContextMenuItem>
        );
        return (
          <SortableItem
            key={item.id}
            id={item.id}
            inside={
              group
                ? {
                    kinds: ["media"],
                    onDrop: (mediaId) =>
                      void command("media.move", {
                        mediaId,
                        parentId: item.id,
                        after: null,
                      }),
                  }
                : undefined
            }
          >
            <ContextMenu>
              <ContextMenuTrigger>
                {group ? (
                  <NavigatorRow
                    id={item.id}
                    icon={mediaGroupIcon}
                    label={item.name}
                    depth={depth}
                    selected={isSelected(selection, "media", item.id)}
                    expanded={expanded}
                    onToggle={(next) => setExpanded("media", item.id, next)}
                    onSelect={() => select({ kind: "media", id: item.id })}
                    createItems={createItems(item.id)}
                  />
                ) : (
                  <MediaFileRow
                    view={view}
                    item={item}
                    depth={depth}
                    selected={isSelected(selection, "media", item.id)}
                    onSelect={() => select({ kind: "media", id: item.id })}
                  />
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                {group ? (
                  <>
                    {createItems(item.id).map((entry) =>
                      entry.disabled === undefined ? (
                        <ContextMenuItem
                          key={entry.label}
                          onClick={entry.onSelect}
                        >
                          <entry.icon /> Add {entry.label}
                        </ContextMenuItem>
                      ) : (
                        <DisabledHint key={entry.label} hint={entry.disabled}>
                          <ContextMenuItem disabled>
                            <entry.icon /> Add {entry.label}
                          </ContextMenuItem>
                        </DisabledHint>
                      ),
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() =>
                        void command("media.ungroup", { mediaId: item.id })
                      }
                    >
                      <Ungroup /> Ungroup
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {remove}
                  </>
                ) : (
                  remove
                )}
              </ContextMenuContent>
            </ContextMenu>
            {expanded && (
              <MediaRows
                view={view}
                parentId={item.id}
                depth={depth + 1}
                createItems={createItems}
              />
            )}
          </SortableItem>
        );
      })}
    </SortableList>
  );
}

/**
 * One Media file, bundled item or Screen Share row; it subscribes to its
 * own live status so a stat elsewhere leaves it alone. A file shows its
 * type or what is wrong with it, a Screen Share whether somebody shares
 * into it: idle, live or interrupted.
 */
function MediaFileRow({
  view,
  item,
  depth,
  selected,
  onSelect,
}: {
  readonly view: DocumentView;
  readonly item: Media;
  readonly depth: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const live = useDocumentPath<MediaLive>(view, ["live", "media", item.id]);
  const type = mediaItemTypeIn(item, catalog) ?? "image";
  // A Screen Share shows its status in place of its type; it has no file to warn about.
  const share =
    item.kind === "share" ? describeShare(shareLive(live)) : undefined;
  const warning =
    item.kind === "share"
      ? undefined
      : mediaWarning(live, item.kind === "bundled" ? "bundled" : "file");
  return (
    <NavigatorRow
      id={item.id}
      icon={mediaTypeIcons[type]}
      label={item.name}
      depth={depth}
      selected={selected}
      onSelect={onSelect}
    >
      {share !== undefined ? (
        <span
          className={cn("text-[0.625rem]", shareStatusTone[share.word])}
          title={`${share.label}. ${share.explanation}`}
          data-share-status={share.word}
        >
          {share.word}
        </span>
      ) : warning === undefined ? (
        <span className="text-[0.625rem] text-muted-foreground">{type}</span>
      ) : (
        <NavigatorWarning
          label={warning.label}
          explanation={warning.explanation}
        />
      )}
    </NavigatorRow>
  );
}
