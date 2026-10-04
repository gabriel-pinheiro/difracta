import type { DocumentView } from "@difracta/client";
import {
  BUNDLED_PACK_ID,
  type PackAttachment,
  type Table,
} from "@difracta/core";
import type { PackLive } from "@difracta/protocol";
import { FolderSearch, LayoutGrid, RefreshCw, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { useBrowser } from "@/library/browser-state";
import { useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { usePackActions } from "./pack-actions";
import {
  entriesText,
  FFMPEG_MISSING,
  MISSING_EXPLANATION,
  packRowStatus,
  preparedText,
} from "./pack-status";

/**
 * A Pack's inspector: its name (a copy the Installation keeps, editable
 * unless the Pack is read-only), where it is on the runtime's disk, how
 * many entries it has and how many are prepared, Rescan, Locate… while it
 * is missing, Browse, and Remove from Installation after a confirm that
 * counts the Layers and Macro actions using it. The Bundled Pack is
 * attached to every Installation and cannot be removed.
 */
export function PackInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const { select } = useSelection();
  const { openPack } = useBrowser();
  const actions = usePackActions(view);
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const live = useDocumentPath<PackLive>(view, ["live", "packs", id]);
  const bundled = id === BUNDLED_PACK_ID;
  const row = attached[id];
  const present = bundled || row !== undefined;

  useEffect(() => {
    if (!present) select({ kind: "installation" });
  }, [present, select]);
  if (!present) return null;

  const name = live?.name ?? row?.name ?? id;
  const status = packRowStatus(live);
  const readOnly = live?.readOnly === true;
  return (
    <>
      <InspectorHeading name={name} id={id} />
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3"
        data-testid="pack-inspector"
      >
        {readOnly ? (
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <span className="text-xs">{name}</span>
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              {bundled
                ? "The Bundled Pack ships with Difracta and is read-only."
                : "This Pack is read-only: its manifest says so."}
            </p>
          </div>
        ) : (
          <NameField
            label="Name"
            value={name}
            onCommit={(next) => actions.rename(id, next)}
          />
        )}
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Location</span>
          {status.kind === "missing" ? (
            <p className="text-[0.6875rem]/relaxed text-amber-300">
              <span className="font-medium">Missing.</span>{" "}
              {MISSING_EXPLANATION}
            </p>
          ) : (
            <span className="font-mono text-[0.625rem] wrap-anywhere">
              {live?.folder === undefined || live.folder === ""
                ? "Loading…"
                : live.folder}
            </span>
          )}
          {row?.relativePath !== undefined && (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              Kept beside the Installation at{" "}
              <span className="font-mono">{row.relativePath}</span>, so a show
              folder carrying it opens anywhere.
            </p>
          )}
        </div>
        {live?.status === "ok" && (
          <div className="grid gap-1" data-testid="pack-counts">
            <span className="text-xs text-muted-foreground">Entries</span>
            <span className="text-xs">
              {entriesText(live.entries)} · {preparedText(live.prepared)}
            </span>
            {live.warning !== undefined && (
              <p className="text-[0.6875rem]/relaxed text-amber-300">
                {live.warning}
              </p>
            )}
            {!live.ffmpeg && (
              <p className="text-[0.6875rem]/relaxed text-amber-300">
                {FFMPEG_MISSING}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => openPack(id)}>
            <LayoutGrid /> Browse
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={status.kind !== "ready" && status.kind !== "preparing"}
            title="Walk the folder again: new files get entries, renamed ones keep theirs"
            onClick={() => actions.rescan(id)}
          >
            <RefreshCw /> Rescan
          </Button>
          {status.kind === "missing" && (
            <Button
              size="sm"
              variant="outline"
              disabled={actions.gate !== undefined}
              title={actions.gate ?? "Name the folder that is this Pack"}
              onClick={() => actions.locate(id, name)}
            >
              <FolderSearch /> Locate…
            </Button>
          )}
        </div>
        {!bundled && (
          <Button
            variant="destructive"
            size="sm"
            className="justify-self-start"
            onClick={() => actions.detach(id)}
          >
            <Trash2 /> Remove from Installation
          </Button>
        )}
      </div>
    </>
  );
}
