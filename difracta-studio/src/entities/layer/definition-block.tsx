import type { FilterLayer, VisualLayer } from "@difracta/core";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { definitionOf, pickLabels } from "@/lib/catalog";
import { DefinitionBadges } from "@/library/definition-badges";
import { useBrowser } from "@/library/browser-state";

/** What the Layer is made of, at the top of its inspector, with the way into the Library. */
export function DefinitionBlock({
  layer,
}: {
  readonly layer: VisualLayer | FilterLayer;
}) {
  const { open } = useBrowser();
  const { id, definition } = definitionOf(layer);
  const labels = pickLabels[layer.kind];
  const without =
    layer.kind === "visual"
      ? "the Layer renders nothing"
      : "the frame passes through unchanged";
  return (
    <div className="grid gap-1.5" data-testid="definition-block">
      <span className="text-xs text-muted-foreground">{labels.singular}</span>
      {definition !== undefined ? (
        <div className="grid gap-1 rounded-md border bg-card p-2">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {definition.name}
            </span>
            <DefinitionBadges definition={definition} />
          </div>
          <p className="text-[0.6875rem]/relaxed text-muted-foreground">
            {definition.description}
          </p>
        </div>
      ) : id !== null ? (
        <p className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[0.6875rem]/relaxed text-amber-300">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          <span>
            {labels.singular} “{id}” is not in this runtime's Catalog, so{" "}
            {without} until another is picked.
          </span>
        </p>
      ) : (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          No {labels.singular} yet: {without} until one is picked.
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        data-library-open={layer.id}
        onClick={() => open(layer.id)}
      >
        {definition === undefined
          ? `Pick a ${labels.singular}…`
          : `Swap ${labels.singular}…`}
      </Button>
    </div>
  );
}
