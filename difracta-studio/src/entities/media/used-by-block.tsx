import type { DocumentView } from "@difracta/client";
import type { ReactNode } from "react";

import { layerIcons } from "@/entities/layer/layer-icons";
import { catalog } from "@/lib/catalog";
import { useSignal } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { layersUsing } from "./media-usage";

/**
 * The Layers showing a Media item, each a way to that Layer, or `none` when
 * no Layer does: the last block of a Media item's inspector.
 */
export function UsedByBlock({
  view,
  mediaId,
  none,
}: {
  readonly view: DocumentView;
  readonly mediaId: string;
  readonly none: ReactNode;
}) {
  const { select } = useSelection();
  // Uses read every Layer's Parameters: a change anywhere may add one.
  const document = useSignal(view.document);
  const uses =
    document === undefined ? [] : layersUsing(document, catalog, mediaId);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <span className="text-xs text-muted-foreground">Used by</span>
      {uses.length === 0 ? (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">{none}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
          {uses.map(({ layer, parameter, label }) => {
            const Icon = layerIcons[layer.kind];
            return (
              <li key={`${layer.id}:${parameter}`}>
                <button
                  type="button"
                  className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    select({ kind: "layer", id: layer.id });
                  }}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{layer.name}</span>
                  <span className="ml-auto text-[0.625rem] text-muted-foreground">
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
