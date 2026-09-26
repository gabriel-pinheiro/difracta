import type { MediaDefinition } from "@difracta/core";

import { bundledUrl, thumbnailUrl } from "@/lib/catalog";

/**
 * The Bundled Media entry the item shows: the clip playing muted beside its
 * name, description, notes, size and length. An entry this runtime's bundle
 * lacks is named by its id, with what to do about it.
 */
export function MediaDescription({
  current,
  currentId,
}: {
  readonly current: MediaDefinition | undefined;
  readonly currentId: string;
}) {
  if (current === undefined)
    return (
      <div className="flex min-h-9 shrink-0 items-center border-b px-2 py-1 text-[0.6875rem]/relaxed text-muted-foreground">
        <p>
          Bundled Media “{currentId}” is not in this runtime's bundle. Pick
          another to replace it.
        </p>
      </div>
    );
  return (
    <div
      data-testid="media-description"
      className="flex max-h-40 shrink-0 gap-2 overflow-auto border-b px-2 py-1.5 text-[0.6875rem]/relaxed text-muted-foreground"
    >
      {current.type === "video" ? (
        <video
          key={current.id}
          aria-hidden
          className="aspect-video w-40 shrink-0 self-start rounded-sm bg-black object-cover"
          poster={thumbnailUrl(current.id)}
          src={bundledUrl(current.id)}
          muted
          loop
          autoPlay
          playsInline
        />
      ) : (
        <img
          alt=""
          className="aspect-video w-40 shrink-0 self-start rounded-sm bg-black object-cover"
          src={bundledUrl(current.id)}
        />
      )}
      <div className="grid min-w-0 content-start gap-1">
        <p>
          <span className="font-medium text-foreground">{current.name}</span>{" "}
          {current.description}
        </p>
        {current.notes !== undefined && <p>{current.notes}</p>}
        <p>{mediaFacts(current)}</p>
      </div>
    </div>
  );
}

/** Size, and length for a video: "1920×1080, 7.1 s". */
export function mediaFacts(entry: MediaDefinition): string {
  const size = `${String(entry.width)}×${String(entry.height)}`;
  return entry.duration === undefined
    ? size
    : `${size}, ${String(Math.round(entry.duration * 10) / 10)} s`;
}
