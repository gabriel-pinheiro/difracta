import type { DocumentView } from "@difracta/client";

import { useClient, useDocumentPath } from "@/lib/client";
import { cn } from "@/lib/utils";

/** Performance control, always in reach: written through the input channel, not undoable. */
export function BlackoutToggle({
  view,
  className,
}: {
  readonly view: DocumentView;
  /** The status strip is lower than the bar, and sizes it to fit. */
  readonly className?: string;
}) {
  const client = useClient();
  const blackout =
    useDocumentPath<boolean>(view, ["operational", "blackout"]) ?? false;
  return (
    <button
      type="button"
      aria-pressed={blackout}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium",
        blackout
          ? "bg-destructive text-white hover:bg-destructive/90"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      onClick={() =>
        client.input(view.documentId, "installation/blackout", !blackout)
      }
    >
      Blackout
    </button>
  );
}
