import type { DocumentView } from "@difracta/client";
import {
  mediaItemTypeIn,
  type Media,
  type MediaBundled,
  type MediaFile,
} from "@difracta/core";
import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { desktopBridge } from "@/documents/desktop-bridge";
import { useDocumentCommands } from "@/documents/document-commands";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath, useSignal } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { useSelection } from "@/selection/selection";

import { layerIcons } from "@/entities/layer/layer-icons";

import { mediaTypeLabels } from "./media-icons";
import { requestMediaPath } from "./media-path-request";
import { describeMediaStatus, type MediaLive } from "./media-status";
import { layersUsing } from "./media-usage";

/** A Media item's inspector: a Group has only its name; a file or bundled item has the rest. */
export function MediaInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const item = useDocumentPath<Media>(view, ["media", id]);

  useEffect(() => {
    if (item === undefined) select({ kind: "installation" });
  }, [item, select]);
  if (item === undefined) return null;
  if (item.kind !== "group")
    return <MediaFileInspector view={view} item={item} />;
  return (
    <>
      <InspectorHeading name={item.name} id={item.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={item.name}
          onCommit={(name) =>
            void command("media.rename", { mediaId: id, name })
          }
        />
      </div>
    </>
  );
}

/**
 * A Media file's name, its path as text (Browse in Desktop opens the native
 * picker over the same file types), the type its extension says, what the
 * runtime reports about the file, and the Layers showing it, each a way to
 * that Layer. A bundled item shows the entry it names instead of a path.
 */
function MediaFileInspector({
  view,
  item,
}: {
  readonly view: DocumentView;
  readonly item: MediaFile | MediaBundled;
}) {
  const id = item.id;
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const { selected } = useDocumentCommands();
  const live = useDocumentPath<MediaLive>(view, ["live", "media", id]);
  // Uses read every Layer's Parameters: a change anywhere may add one.
  const document = useSignal(view.document);
  const [request, setRequest] = useState<NameRequest | undefined>(undefined);
  const desktop = desktopBridge() !== undefined;
  const type = mediaItemTypeIn(item, catalog);
  const status =
    live === undefined ? undefined : describeMediaStatus(live.status);
  const uses = document === undefined ? [] : layersUsing(document, catalog, id);
  const setPath = (path: string): void => {
    void command("media.path", { mediaId: id, path });
  };

  return (
    <>
      <InspectorHeading name={item.name} id={item.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={item.name}
          onCommit={(name) =>
            void command("media.rename", { mediaId: id, name })
          }
        />
        {item.kind === "bundled" ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Bundled: </span>
            {catalog.mediaEntry(item.bundled)?.name ?? item.bundled}
          </p>
        ) : (
          <div className="grid gap-1">
            <NameField label="Path" value={item.path} onCommit={setPath} />
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              Relative to the Installation file's folder.
            </p>
            {desktop && (
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() =>
                  requestMediaPath({
                    purpose: "change",
                    documentPath: selected?.path ?? null,
                    initial: item.path,
                    showDialog: setRequest,
                    onPath: setPath,
                  })
                }
              >
                <FolderOpen /> Browse…
              </Button>
            )}
          </div>
        )}
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Type</span>
          <span className="text-xs">
            {type === undefined
              ? "Not an image or video"
              : mediaTypeLabels[type]}
          </span>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          {status === undefined ? (
            <span className="text-xs text-muted-foreground">
              Not reported yet.
            </span>
          ) : (
            <p
              className={
                live?.status === "ok"
                  ? "text-[0.6875rem]/relaxed"
                  : "text-[0.6875rem]/relaxed text-amber-300"
              }
            >
              <span className="font-medium">{status.label}.</span>{" "}
              {status.explanation}
            </p>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <span className="text-xs text-muted-foreground">Used by</span>
          {uses.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Layer shows this item. Pick it in a Layer's{" "}
              {type === "video" ? "Video" : "Image"} row.
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
              {uses.map(({ layer, parameter, label }) => {
                const Icon = layerIcons[layer.kind];
                return (
                  <li key={`${layer.id}:${parameter}`}>
                    <button
                      type="button"
                      className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        // Selecting from here reveals the row in the navigator.
                        setExpanded("scene", layer.sceneId, true);
                        if (layer.parentId !== null)
                          setExpanded("layer", layer.parentId, true);
                        select({ kind: "layer", id: layer.id });
                      }}
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{layer.name}</span>
                      <span className="ml-auto text-[0.625rem] text-muted-foreground">
                        {label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <NameDialog request={request} onClose={() => setRequest(undefined)} />
    </>
  );
}
