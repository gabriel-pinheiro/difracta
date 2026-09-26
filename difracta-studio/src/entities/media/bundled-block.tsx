import type { MediaBundled } from "@difracta/core";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { catalog } from "@/lib/catalog";
import { useBrowser } from "@/library/browser-state";
import { DefinitionBadges } from "@/library/definition-badges";
import { mediaFacts } from "@/library/media-description";

/** The Bundled Media entry a bundled item shows, in its inspector, with the way into the Library. */
export function BundledBlock({ item }: { readonly item: MediaBundled }) {
  const { openMedia } = useBrowser();
  const entry = catalog.mediaEntry(item.bundled);
  return (
    <div className="grid gap-1.5" data-testid="bundled-block">
      <span className="text-xs text-muted-foreground">Bundled</span>
      {entry !== undefined ? (
        <div className="grid gap-1 rounded-md border bg-card p-2">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {entry.name}
            </span>
            <DefinitionBadges definition={entry} />
          </div>
          <p className="text-[0.6875rem]/relaxed text-muted-foreground">
            {entry.description}
          </p>
          <p className="text-[0.6875rem]/relaxed text-muted-foreground">
            {mediaFacts(entry)}
          </p>
        </div>
      ) : (
        <p className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[0.6875rem]/relaxed text-amber-300">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          <span>
            Bundled Media “{item.bundled}” is not in this runtime's bundle, so
            the Outputs show nothing for it until another is picked.
          </span>
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        data-library-open={item.id}
        onClick={() => openMedia(item.id)}
      >
        Change…
      </Button>
    </div>
  );
}
