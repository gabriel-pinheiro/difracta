import type { Definition } from "@difracta/core";
import { forwardRef } from "react";

import { thumbnailUrl } from "@/lib/catalog";
import { cn } from "@/lib/utils";

import { DefinitionBadges } from "./definition-badges";

/** One definition in the Library grid; the current one carries the selection ring. */
export const LibraryTile = forwardRef<
  HTMLButtonElement,
  {
    readonly definition: Definition;
    readonly current: boolean;
    readonly onPick: () => void;
  }
>(function LibraryTile({ definition, current, onPick }, ref) {
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
    >
      <span className="relative block w-full">
        <img
          alt=""
          className="aspect-video w-full rounded-sm object-cover"
          loading="lazy"
          src={thumbnailUrl(definition.id)}
        />
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
