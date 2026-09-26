import type { Definition, MediaDefinition } from "@difracta/core";
import { forwardRef, useState } from "react";

import { bundledUrl, thumbnailUrl } from "@/lib/catalog";
import { cn } from "@/lib/utils";

import { DefinitionBadges } from "./definition-badges";

/**
 * One entry in the Library grid; the current one carries the selection
 * ring. A Bundled Media video plays muted over its thumbnail while the
 * pointer is on the tile; the video element exists only then, so a grid of
 * clips loads nothing until one is hovered.
 */
export const LibraryTile = forwardRef<
  HTMLButtonElement,
  {
    readonly definition: Definition | MediaDefinition;
    readonly current: boolean;
    readonly onPick: () => void;
  }
>(function LibraryTile({ definition, current, onPick }, ref) {
  const [hovered, setHovered] = useState(false);
  const plays =
    hovered && definition.kind === "media" && definition.type === "video";
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={current}
      data-testid="library-tile"
      data-id={definition.id}
      title={definition.description}
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1 text-left outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        current && "border-selection ring-1 ring-selection",
      )}
      onClick={onPick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className="relative block w-full">
        <img
          alt=""
          className="aspect-video w-full rounded-sm object-cover"
          loading="lazy"
          src={thumbnailUrl(definition.id)}
        />
        {plays && (
          <video
            aria-hidden
            className="absolute inset-0 aspect-video w-full rounded-sm object-cover"
            src={bundledUrl(definition.id)}
            muted
            loop
            autoPlay
            playsInline
          />
        )}
        <DefinitionBadges
          definition={definition}
          className="absolute top-1 right-1"
        />
      </span>
      <span className="truncate px-0.5 text-xs font-medium">
        {definition.name}
      </span>
    </button>
  );
});
