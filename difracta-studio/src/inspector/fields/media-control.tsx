import type { DocumentView } from "@difracta/client";
import {
  generateId,
  orderedEntries,
  type PackAttachment,
  type ResolvedAddress,
  type Share,
  type Table,
} from "@difracta/core";
import type { LiveState } from "@difracta/protocol";
import { FolderSearch, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDocumentCommands } from "@/documents/document-commands";
import { mediaTypeIcons } from "@/entities/media/media-icons";
import { entryFacts } from "@/entities/pack/entry-facts";
import { usePackActions } from "@/entities/pack/pack-actions";
import { packThumbUrl } from "@/entities/pack/pack-urls";
import { useBrowser } from "@/library/browser-state";
import { useCommand, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSelection } from "@/selection/selection";

import { chipState } from "./media-chip-state";

/**
 * The control for a media Address. For an image or a video: a chip with the
 * entry's thumbnail, name, Pack and facts, which opens the Library picking
 * for this Address when clicked; a missing Pack or entry reads so, with
 * Locate… when it is the Pack and this Studio may name folders; a value
 * that is not a Media reference says to choose again; "Choose media…" when
 * empty. For a Screen Share: a select over the Installation's Screen
 * Shares, None first, and a "+" that adds a slot and picks it here in one
 * flow, as the Target row's "+" makes a Surface.
 */
export function MediaControl({
  resolved,
  value,
  send,
}: {
  readonly resolved: ResolvedAddress;
  readonly value: unknown;
  readonly send: (value: string) => void;
}) {
  const { view } = useDocumentCommands();
  if (view === undefined) return null;
  if (resolved.accepts === "live")
    return (
      <ShareControl view={view} resolved={resolved} value={value} send={send} />
    );
  return (
    <MediaChip view={view} resolved={resolved} value={value} send={send} />
  );
}

function MediaChip({
  view,
  resolved,
  value,
  send,
}: {
  readonly view: DocumentView;
  readonly resolved: ResolvedAddress;
  readonly value: unknown;
  readonly send: (value: string) => void;
}) {
  const { openParameter } = useBrowser();
  const { selection } = useSelection();
  const actions = usePackActions(view);
  const packs =
    useDocumentPath<LiveState["packs"]>(view, ["live", "packs"]) ?? {};
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const state = chipState(value, packs, attached);
  const accepts = resolved.accepts === "video" ? "video" : "image";
  const Icon = mediaTypeIcons[accepts];
  const selector = `[data-media-chip="${CSS.escape(resolved.address)}"]`;
  const open = (): void =>
    openParameter({
      address: resolved.address,
      label: resolved.label,
      owner: resolved.owner,
      accepts,
      initial: typeof value === "string" ? value : "",
      anchor: selection,
      apply: send,
      returnFocus: selector,
    });
  const label =
    state.kind === "empty"
      ? "Choose media…"
      : state.kind === "invalid"
        ? "Media no longer exists, choose again"
        : state.kind === "missing-pack"
          ? `Pack “${state.packName}” is missing`
          : state.kind === "missing-entry"
            ? `No entry “${state.entryId}” in ${state.packName}`
            : state.entry.name;
  const warns = state.kind !== "empty" && state.kind !== "entry";
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <button
        type="button"
        data-media-chip={resolved.address}
        data-chip-state={state.kind}
        aria-label={`${resolved.label}: ${label}. Choose media`}
        title={
          state.kind === "entry"
            ? `${state.entry.name} · ${state.packName}. Click to pick another.`
            : `${label}. Click to pick media.`
        }
        className={cn(
          "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-input/20 px-1 text-left text-xs outline-none hover:bg-input/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          warns && "border-amber-300/50 text-amber-300",
          state.kind === "empty" && "text-muted-foreground",
        )}
        onClick={open}
      >
        {state.kind === "entry" && state.entry.hasThumbnail ? (
          <img
            alt=""
            className="h-5 w-8 shrink-0 rounded-sm bg-black object-contain"
            src={packThumbUrl(state.reference, state.entry)}
          />
        ) : (
          <Icon className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {label}
          {state.kind === "entry" && (
            <span className="ml-1 text-[0.625rem] text-muted-foreground">
              {state.packName}
              {state.entry.status === "missing" && " · file missing"}
            </span>
          )}
        </span>
        {state.kind === "entry" && (
          <span className="hidden shrink-0 text-[0.625rem] text-muted-foreground @[22rem]:inline">
            {entryFacts(state.entry)}
          </span>
        )}
      </button>
      {state.kind === "missing-pack" && actions.gate === undefined && (
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          title={`Locate Pack “${state.packName}”…`}
          aria-label={`Locate Pack ${state.packName}`}
          onClick={() => actions.locate(state.packId, state.packName)}
        >
          <FolderSearch />
        </Button>
      )}
    </div>
  );
}

function ShareControl({
  view,
  resolved,
  value,
  send,
}: {
  readonly view: DocumentView;
  readonly resolved: ResolvedAddress;
  readonly value: unknown;
  readonly send: (value: string) => void;
}) {
  const shares = useDocumentPath<Table<Share>>(view, ["shares"]) ?? {};
  const command = useCommand(view);
  const items = orderedEntries(shares).map((share) => ({
    value: share.id,
    label: share.name,
  }));
  const current = typeof value === "string" && value in shares ? value : null;
  const create = (): void => {
    const id = generateId("share");
    void command("share.create", { id }).then(() => send(id));
  };
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <Select
        value={current}
        items={[{ value: null, label: "None" }, ...items]}
        onValueChange={(next: string | null) => send(next ?? "")}
      >
        <SelectTrigger aria-label={resolved.label} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>
            {items.length === 0 ? "No Screen Share in Media" : "None"}
          </SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        title="Add a Screen Share to Media and pick it here"
        aria-label={`New ${resolved.label}`}
        onClick={create}
      >
        <Plus />
      </Button>
    </div>
  );
}
