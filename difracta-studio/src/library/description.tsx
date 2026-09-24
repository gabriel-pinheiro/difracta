import type { Definition } from "@difracta/core";

import { pickLabels } from "@/lib/catalog";

export /** The current pick's description, or how to start. */
function Description({
  kind,
  current,
  currentId,
}: {
  readonly kind: "visual" | "filter";
  readonly current: Definition | undefined;
  readonly currentId: string | null;
}) {
  const labels = pickLabels[kind];
  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-b px-2 py-1 text-[0.6875rem]/relaxed text-muted-foreground">
      {current !== undefined ? (
        <p className="min-w-0">
          <span className="font-medium text-foreground">{current.name}</span>{" "}
          {current.description}
        </p>
      ) : currentId !== null ? (
        <p>
          {labels.singular} “{currentId}” is not in this runtime's Catalog. Pick
          another to replace it.
        </p>
      ) : (
        <p>
          Pick a {labels.singular}: click a tile or use the arrow keys. The
          Layer shows it right away.
        </p>
      )}
    </div>
  );
}
