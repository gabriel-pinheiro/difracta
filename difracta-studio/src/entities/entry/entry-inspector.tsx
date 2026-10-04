import type { DocumentView } from "@difracta/client";
import {
  BUNDLED_PACK_ID,
  parseMediaReference,
  settings,
  type PackAttachment,
  type Table,
} from "@difracta/core";
import type {
  PackEntryLive,
  PackLive,
  RuntimeRequestPayload,
} from "@difracta/protocol";
import { FolderOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { entryFacts } from "@/entities/pack/entry-facts";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { OptionalNumber } from "@/inspector/fields/optional-number";
import { useBrowser } from "@/library/browser-state";
import { folderOf } from "@/library/media-search";
import { useClient, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { MediaPlayer, type Measured } from "./media-player";
import { READ_ONLY_REASON } from "./tag-edit";
import { TagEditor } from "./tag-editor";

type Update = Omit<RuntimeRequestPayload<"media.update">, "packId" | "entryId">;

/**
 * A Pack entry's inspector, by its Media reference: the player, its name,
 * tags, Beats and first beat, the facts line, its file's path inside the
 * Pack (click to open the Library on that folder) and a notice when its
 * file is missing. Every edit is a `media.update` to the runtime, which
 * writes the Pack's manifest; on a read-only Pack every field is off and
 * says why. A size or length the browser read of an original the manifest
 * lacks goes the same way, whatever Pack it is from, unless that Pack is
 * read-only. When the entry is gone the selection moves to its Pack, or to
 * the Installation when the Pack is gone too.
 */
export function EntryInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const { select } = useSelection();
  const reference = parseMediaReference(id);
  const packId = reference?.packId ?? "";
  const entryId = reference?.entryId ?? "";
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const pack = useDocumentPath<PackLive>(view, ["live", "packs", packId]);
  const entry = pack?.entries[entryId];
  const packPresent = packId === BUNDLED_PACK_ID || packId in attached;
  const present = entry !== undefined && pack?.status !== "missing";

  useEffect(() => {
    if (present) return;
    select(
      packPresent ? { kind: "pack", id: packId } : { kind: "installation" },
    );
  }, [present, packPresent, packId, select]);

  if (!present || pack === undefined) return null;
  return (
    <>
      <InspectorHeading name={entry.name} id={id} />
      <EntryFields reference={id} packId={packId} pack={pack} entry={entry} />
    </>
  );
}

function EntryFields({
  reference,
  packId,
  pack,
  entry,
}: {
  readonly reference: string;
  readonly packId: string;
  readonly pack: PackLive;
  readonly entry: PackEntryLive;
}) {
  const client = useClient();
  const { openPack } = useBrowser();
  const disabled = pack.readOnly ? READ_ONLY_REASON : undefined;
  const packTags = useMemo(
    () => Object.values(pack.entries).flatMap((other) => other.tags),
    [pack.entries],
  );
  const update = (change: Update): void => {
    client
      .request("media.update", { packId, entryId: entry.id, ...change })
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
  };
  const measured = (read: Measured): void => {
    if (pack.readOnly) return;
    update({
      width: read.width,
      height: read.height,
      ...(read.duration === undefined || entry.duration !== undefined
        ? {}
        : { duration: read.duration }),
    });
  };
  const facts = entryFacts(entry);
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 text-xs"
      data-testid="entry-inspector"
    >
      <MediaPlayer
        reference={reference}
        entry={entry}
        disabled={disabled}
        onThumbnailAt={(thumbnailAt) => update({ thumbnailAt })}
        onMeasured={measured}
      />
      {entry.status === "missing" && (
        <p className="text-[0.6875rem]/relaxed text-amber-300">
          <span className="font-medium">Missing.</span> No file at this path in
          the Pack's folder. Its entry is kept: a file moved inside the Pack
          takes it back on Rescan.
        </p>
      )}
      {disabled === undefined ? (
        <NameField
          label="Name"
          value={entry.name}
          onCommit={(name) => update({ name })}
        />
      ) : (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <span className="text-xs">{entry.name}</span>
        </div>
      )}
      {entry.description !== undefined && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          {entry.description}
        </p>
      )}
      <TagEditor
        tags={entry.tags}
        packTags={packTags}
        disabled={disabled}
        onChange={(tags) => update({ tags: [...tags] })}
      />
      {entry.type === "video" && (
        <BeatsFields entry={entry} disabled={disabled} onUpdate={update} />
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.6875rem]">
        {facts !== "" && (
          <>
            <dt className="text-muted-foreground">Facts</dt>
            <dd data-testid="media-facts">{facts}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Pack</dt>
        <dd className="min-w-0 truncate">{pack.name}</dd>
        <dt className="text-muted-foreground">File</dt>
        <dd className="min-w-0">
          <button
            type="button"
            className="flex max-w-full items-center gap-1 text-left font-mono text-[0.625rem] wrap-anywhere hover:text-foreground"
            title="Open the Library on this folder of the Pack"
            onClick={() => openPack(packId, { folder: folderOf(entry.file) })}
          >
            <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
            {entry.file}
          </button>
        </dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-mono text-[0.625rem] wrap-anywhere">{reference}</dd>
      </dl>
      {entry.notes !== undefined && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          {entry.notes}
        </p>
      )}
      {disabled !== undefined && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          {disabled}
        </p>
      )}
    </div>
  );
}

/** A video's Beats and the time of its first one, as the entry's Inspector edits them. */
function BeatsFields({
  entry,
  disabled,
  onUpdate,
}: {
  readonly entry: PackEntryLive;
  readonly disabled: string | undefined;
  readonly onUpdate: (change: Update) => void;
}) {
  return (
    <div className="grid gap-1" data-testid="beats-fields">
      <span className="text-xs text-muted-foreground">Beats</span>
      <div className="flex items-center gap-1.5">
        <OptionalNumber
          label="Beats the video lasts"
          placeholder="none"
          className="max-w-16 flex-none"
          accepts={(beats) => beats > 0 && beats <= settings.media.maxBeats}
          value={entry.beats}
          disabled={disabled}
          onCommit={(beats) => onUpdate({ beats: beats ?? null })}
        />
        <span className="text-[0.6875rem] text-muted-foreground">beats</span>
        {entry.beats !== undefined && (
          <>
            <OptionalNumber
              label="Time of the first beat, in seconds"
              placeholder="0"
              className="max-w-16 flex-none"
              accepts={(time) =>
                time >= 0 &&
                (entry.duration === undefined || time < entry.duration)
              }
              value={entry.firstBeat}
              onCommit={(firstBeat) =>
                disabled === undefined &&
                onUpdate({ firstBeat: firstBeat ?? 0 })
              }
            />
            <span className="text-[0.6875rem] text-muted-foreground">
              s to the first
            </span>
          </>
        )}
      </div>
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        How many beats the clip lasts, 16 for a four-bar loop; a Video with Sync
        to Tempo on follows a tempo with it.
      </p>
    </div>
  );
}
