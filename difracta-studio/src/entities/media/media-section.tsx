import type { DocumentView } from "@difracta/client";
import {
  mediaKindOf,
  orderedEntries,
  type Media,
  type Table,
} from "@difracta/core";
import { Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useRemoveEntity } from "@/selection/remove-selection";
import { isSelected, useSelection } from "@/selection/selection";

import { mediaIcons } from "./media-icons";
import {
  mediaWarning,
  mediaWarningCount,
  type MediaLive,
  type MediaLiveTable,
} from "./media-status";
import { useCreateMedia } from "./use-create-media";

/**
 * Navigator section listing the Media items: each row with its kind's icon
 * and, when the runtime cannot serve its file, why. The "+" asks for the
 * file first (a native picker in Desktop, a typed path in a browser), since
 * the item takes its name from the file.
 */
export function MediaSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const live = useDocumentPath<MediaLiveTable>(view, ["live", "media"]) ?? {};
  const { create, dialog } = useCreateMedia();
  const ordered = orderedEntries(media);

  return (
    <>
      <NavigatorSection
        storageKey="media"
        holds={["media"]}
        label="Media"
        empty={ordered.length === 0 ? "No Media yet." : undefined}
        warnings={mediaWarningCount(media, live)}
        onCreate={() =>
          create({ onCreated: (id) => select({ kind: "media", id }) })
        }
      >
        <SortableList
          kind="media"
          ids={ordered.map((item) => item.id)}
          selectedId={selection?.kind === "media" ? selection.id : undefined}
          onMove={(id, after) =>
            void command("entity.move", { table: "media", id, after })
          }
        >
          {ordered.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              <MediaRow
                view={view}
                item={item}
                selected={isSelected(selection, "media", item.id)}
                onSelect={() => select({ kind: "media", id: item.id })}
              />
            </SortableItem>
          ))}
        </SortableList>
      </NavigatorSection>
      {dialog}
    </>
  );
}

/** One Media row; it subscribes to its own live status so a stat elsewhere leaves it alone. */
function MediaRow({
  view,
  item,
  selected,
  onSelect,
}: {
  readonly view: DocumentView;
  readonly item: Media;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const removeEntity = useRemoveEntity();
  const live = useDocumentPath<MediaLive>(view, ["live", "media", item.id]);
  const kind = mediaKindOf(item.path) ?? "image";
  const warning = mediaWarning(live);
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <NavigatorRow
          id={item.id}
          icon={mediaIcons[kind]}
          label={item.name}
          selected={selected}
          onSelect={onSelect}
        >
          {warning === undefined ? (
            <span className="text-[0.625rem] text-muted-foreground">
              {kind}
            </span>
          ) : (
            <NavigatorWarning
              label={warning.label}
              explanation={warning.explanation}
            />
          )}
        </NavigatorRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          onClick={() => removeEntity("media", item.id)}
        >
          <Trash2 /> Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
