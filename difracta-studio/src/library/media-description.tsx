import { entryFacts } from "@/entities/pack/entry-facts";

import type { MediaRow } from "./media-search";

/**
 * The strip above the grid while the Library picks for a media Address:
 * the entry the Address holds now, its facts and tags, or how to start.
 * Editing an entry is done from its Inspector while browsing its Pack, not
 * while picking.
 */
export function MediaDescription({
  current,
  currentId,
  noun,
}: {
  readonly current: MediaRow | undefined;
  readonly currentId: string | null;
  /** "images" or "videos". */
  readonly noun: string;
}) {
  return (
    <div
      data-testid="media-description"
      className="flex min-h-9 shrink-0 items-center gap-2 border-b px-2 py-1 text-[0.6875rem]/relaxed text-muted-foreground"
    >
      {current !== undefined ? (
        <p className="min-w-0">
          <span className="font-medium text-foreground">
            {current.entry.name}
          </span>{" "}
          <span>{current.packName}</span>
          {entryFacts(current.entry) !== "" && (
            <span> · {entryFacts(current.entry)}</span>
          )}
          {current.entry.tags.length > 0 && (
            <span> · {current.entry.tags.join(", ")}</span>
          )}
          {current.entry.description !== undefined && (
            <span> · {current.entry.description}</span>
          )}
        </p>
      ) : currentId !== null ? (
        <p>“{currentId}” is in no loaded Pack. Pick another to replace it.</p>
      ) : (
        <p>
          Pick one of the {noun}: click a tile or use the arrow keys. The Layer
          shows it right away.
        </p>
      )}
    </div>
  );
}
