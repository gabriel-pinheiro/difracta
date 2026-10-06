import type { DocumentView } from "@difracta/client";
import { parseMediaReference } from "@difracta/core";
import type { PackLive } from "@difracta/protocol";
import { FolderSearch, RefreshCw, Trash2, TriangleAlert } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { packIcon } from "@/entities/media/media-icons";
import { useBrowser } from "@/library/browser-state";
import { NavigatorRow, RowAction } from "@/navigator/navigator-row";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { isSelected, useSelection } from "@/selection/selection";

import type { PackActions } from "./pack-actions";
import {
  MISSING_EXPLANATION,
  packRowStatus,
  packWarning,
  toGo,
} from "./pack-status";

/** One Pack the Installation has: the Bundled Pack, or an attached one by id and name. */
export interface PackRowItem {
  readonly id: string;
  readonly name: string;
  readonly bundled: boolean;
}

/**
 * A Pack's row in the Media section: its name, then what the runtime says
 * of it: "preparing, 4 to go" with a thin bar while thumbnails and proxies
 * bake, "missing" with Locate… when nothing on the machine is the Pack, a
 * read-only badge, a warning icon when the scan hit a limit or ffmpeg is
 * absent. Selecting it shows the Pack in the inspector and opens the
 * Library on it to browse; while one of its entries is selected from a
 * tile, the row shows as holding the selection. The Bundled Pack cannot be
 * detached.
 */
export function PackRow({
  pack,
  live,
  actions,
}: {
  readonly view: DocumentView;
  readonly pack: PackRowItem;
  readonly live: PackLive | undefined;
  readonly actions: PackActions;
}) {
  const { selection, select } = useSelection();
  const { openPack } = useBrowser();
  const status = packRowStatus(live);
  const warning = packWarning(live);
  const name = live?.name ?? pack.name;
  const holdsSelection =
    selection?.kind === "entry" &&
    parseMediaReference(selection.id)?.packId === pack.id;
  const show = (): void => {
    select({ kind: "pack", id: pack.id });
    openPack(pack.id);
  };
  const locate = (): void => actions.locate(pack.id, name);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div data-pack-row={pack.id}>
            <NavigatorRow
              id={pack.id}
              depth={1}
              icon={packIcon}
              label={name}
              selected={isSelected(selection, "pack", pack.id)}
              holdsSelection={holdsSelection}
              onSelect={show}
              onOpen={show}
              actions={
                status.kind === "missing" && actions.gate === undefined ? (
                  <RowAction label={`Locate ${name}…`} active onClick={locate}>
                    <FolderSearch className="size-3" />
                  </RowAction>
                ) : undefined
              }
            >
              {pack.bundled && <RowBadge>Bundled</RowBadge>}
              {live?.readOnly === true && !pack.bundled && (
                <RowBadge>read-only</RowBadge>
              )}
              {status.kind === "loading" && (
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                  loading
                </span>
              )}
              {status.kind === "missing" && (
                <NavigatorWarning
                  label="missing"
                  explanation={MISSING_EXPLANATION}
                />
              )}
              {status.kind === "preparing" && (
                <Preparing done={status.done} total={status.total} />
              )}
              {warning !== undefined && <WarningIcon explanation={warning} />}
            </NavigatorRow>
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={show}>Browse</ContextMenuItem>
        <ContextMenuItem
          disabled={status.kind === "missing" || status.kind === "loading"}
          onClick={() => actions.rescan(pack.id)}
        >
          <RefreshCw /> Rescan
        </ContextMenuItem>
        {status.kind === "missing" && (
          <ContextMenuItem
            disabled={actions.gate !== undefined}
            onClick={locate}
          >
            <FolderSearch /> Locate…
          </ContextMenuItem>
        )}
        {!pack.bundled && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => actions.detach(pack.id)}
            >
              <Trash2 /> Remove from Installation
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RowBadge({ children }: { readonly children: string }) {
  return (
    <span className="shrink-0 rounded-sm border px-1 text-[0.5625rem] leading-4 text-muted-foreground">
      {children}
    </span>
  );
}

/** "preparing, 4 to go" with a thin bar filling as the baker works through the Pack. */
function Preparing({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}) {
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  const left = toGo({ done, total });
  return (
    <span
      data-pack-preparing={`${String(done)}/${String(total)}`}
      className="flex shrink-0 items-center gap-1 text-[0.625rem] text-muted-foreground tabular-nums"
      title={`Baking thumbnails and proxies: ${String(done)} of ${String(total)} entries prepared`}
    >
      preparing, {left} to go
      <span className="h-0.5 w-6 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full bg-foreground/60"
          style={{ width: `${String(fraction * 100)}%` }}
        />
      </span>
    </span>
  );
}

function WarningIcon({ explanation }: { readonly explanation: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="flex shrink-0 items-center text-amber-300" />}
      >
        <TriangleAlert aria-hidden className="size-3" />
        <span className="sr-only">{explanation}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{explanation}</TooltipContent>
    </Tooltip>
  );
}
