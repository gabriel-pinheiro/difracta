import { hasTag } from "@difracta/core";
import { Repeat, Zap } from "lucide-react";
import { forwardRef, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { mediaTypeIcons } from "@/entities/media/media-icons";
import {
  packEntryUrl,
  packProxyUrl,
  packThumbUrl,
} from "@/entities/pack/pack-urls";
import { cn } from "@/lib/utils";

import { hoverSource, type MediaRow } from "./media-search";

/**
 * One Pack entry in the Library grid: its baked thumbnail, or the type's
 * icon until the runtime has baked one; while the pointer is on the tile a
 * video plays muted from its proxy, or from the original when there is no
 * proxy, the element existing only then so a grid of clips loads nothing
 * until one is hovered. Small badges mark a seamless `loop` and a one-shot
 * `hit`. The current one carries the selection ring; a missing entry is
 * dimmed and says so.
 */
export const MediaTile = forwardRef<
  HTMLButtonElement,
  {
    readonly row: MediaRow;
    readonly current: boolean;
    readonly onPick: () => void;
  }
>(function MediaTile({ row, current, onPick }, ref) {
  const [hovered, setHovered] = useState(false);
  const { entry, reference } = row;
  const Icon = mediaTypeIcons[entry.type];
  const source = hoverSource(entry);
  const missing = entry.status === "missing";
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={current}
      data-testid="library-tile"
      data-id={reference}
      title={entry.description ?? `${entry.name} · ${row.packName}`}
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1 text-left outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        current && "border-selection ring-1 ring-selection",
        missing && "opacity-60",
      )}
      onClick={onPick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className="relative block aspect-video w-full overflow-hidden rounded-sm bg-black">
        {entry.hasThumbnail ? (
          <img
            alt=""
            className="size-full object-contain"
            loading="lazy"
            src={packThumbUrl(reference, entry)}
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <Icon className="size-6" />
          </span>
        )}
        {hovered && source !== undefined && !missing && (
          <video
            aria-hidden
            data-hover-source={source}
            className="absolute inset-0 size-full object-contain"
            src={
              source === "proxy"
                ? packProxyUrl(reference, entry)
                : packEntryUrl(reference)
            }
            muted
            loop
            autoPlay
            playsInline
          />
        )}
        <span className="absolute top-1 right-1 flex items-center gap-1">
          {hasTag(entry, "loop") && (
            <TileBadge
              icon={Repeat}
              text="Loop: plays seamlessly end to start."
            />
          )}
          {hasTag(entry, "hit") && (
            <TileBadge
              icon={Zap}
              text="Hit: a one-shot, for a Cue or a Macro."
            />
          )}
        </span>
        {missing && (
          <span className="absolute inset-x-1 bottom-1 rounded-sm bg-background/80 px-1 text-[0.625rem] text-amber-300">
            file missing
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-baseline gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {entry.name}
        </span>
        <span className="shrink-0 truncate text-[0.625rem] text-muted-foreground">
          {row.packName}
        </span>
      </span>
    </button>
  );
});

function TileBadge({
  icon: Icon,
  text,
}: {
  readonly icon: typeof Repeat;
  readonly text: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="grid size-4 place-items-center rounded-sm bg-background/70 text-muted-foreground" />
        }
      >
        <Icon aria-hidden className="size-2.5" />
        <span className="sr-only">{text}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
