import type { DocumentView } from "@difracta/client";
import type { Media, Table } from "@difracta/core";
import type { MediaLive } from "@difracta/protocol";
import { CircleStop } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { useClient, useCommand, useDocumentPath } from "@/lib/client";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

import { SharePicture } from "./share-picture";
import { shareLive } from "./share-slots";
import {
  describeShare,
  shareStatusTone,
  sinceText,
  sourceText,
  viewersText,
} from "./share-status";
import { UsedByBlock } from "./used-by-block";

type MediaShare = Extract<Media, { kind: "share" }>;

/**
 * A Screen Share's inspector: its name, then who shares into it, from the
 * live state: the status, the Sharer, screen or window, since when and its
 * Viewers, the picture, and Stop, which ends the share from here as it
 * would from the share window. Idle, it says how a share starts, since
 * only Difracta Desktop on the Sharer's own computer can start one.
 */
export function ShareInspector({
  view,
  item,
}: {
  readonly view: DocumentView;
  readonly item: MediaShare;
}) {
  const id = item.id;
  const client = useClient();
  const command = useCommand(view);
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const state = shareLive(
    useDocumentPath<MediaLive>(view, ["live", "media", id]),
  );
  const text = describeShare(state);
  const now = useNow(state.status !== "idle");
  const [stopping, setStopping] = useState(false);

  function stop(): void {
    setStopping(true);
    client
      .request("shares.stop", { mediaId: id })
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      })
      .finally(() => setStopping(false));
  }

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
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Type</span>
          <span className="text-xs">
            Screen Share, shown by the Live Visual
          </span>
        </div>
        <div className="grid gap-1" data-testid="share-status">
          <span className="text-xs text-muted-foreground">Status</span>
          <p className="text-[0.6875rem]/relaxed">
            <span className={cn("font-medium", shareStatusTone[text.word])}>
              {text.label}.
            </span>{" "}
            {text.explanation}
          </p>
        </div>
        {state.status !== "idle" && (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Sharer</dt>
              <dd className="truncate">{state.sharer}</dd>
              <dt className="text-muted-foreground">Shares</dt>
              <dd>{sourceText(state.source)}</dd>
              <dt className="text-muted-foreground">Since</dt>
              <dd>{sinceText(state.since, now)}</dd>
              <dt className="text-muted-foreground">Viewers</dt>
              <dd>{viewersText(state.viewers)}</dd>
            </dl>
            <div className="grid gap-1">
              <SharePicture
                mediaId={id}
                media={media}
                empty="Waiting for the picture…"
              />
              <p className="text-[0.6875rem]/relaxed text-muted-foreground">
                While this picture shows, this Studio is one of the Viewers.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="justify-self-start"
              title="Ends the share for every Viewer; the Sharer hears it was stopped"
              disabled={stopping}
              onClick={stop}
            >
              <CircleStop /> Stop
            </Button>
          </>
        )}
        <UsedByBlock
          view={view}
          mediaId={id}
          none="No Layer shows this Screen Share. Pick it in a Live Layer's Screen Share row."
        />
      </div>
    </>
  );
}
