import type { DocumentView } from "@difracta/client";
import type {
  Definition,
  FilterLayer,
  Layer,
  ParameterValues,
  Table,
  VisualLayer,
} from "@difracta/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { catalog, definitionOf, pickLabels } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import {
  focusNavigatorRow,
  removeFocusingNeighbour,
} from "@/navigator/focus-row";
import { useSelection } from "@/selection/selection";

import { useBrowser, type LibraryBinding } from "./browser-state";
import { Description } from "./description";
import { FacetControl } from "./facet-control";
import { LibraryShell } from "./library-shell";
import { LibraryTile } from "./library-tile";
import { MediaLibraryView } from "./media-library";
import {
  ANY_FACETS,
  pickOnEnter,
  rankDefinitions,
  type Facets,
} from "./search";

/** What the bound Layer held when the Library opened, so Escape can put it back. */
interface RestorePoint {
  readonly id: string | null;
  readonly parameters: ParameterValues;
}

/** The Library for whatever it is bound to: a Visual or Filter Layer, or a bundled Media item. */
export function LibraryView({
  view,
  binding,
}: {
  readonly view: DocumentView;
  readonly binding: LibraryBinding;
}) {
  return binding.kind === "layer" ? (
    <LayerLibraryView view={view} layerId={binding.id} />
  ) : (
    <MediaLibraryView view={view} binding={binding} />
  );
}

/**
 * The Library bound to one Visual or Filter Layer: the Catalog as a grid of
 * tiles. Clicking a tile or moving with the arrow keys applies it to the
 * Layer at once, so the Outputs are the preview; Enter keeps the pick, or
 * picks the first result while the Layer has none, and Escape discards the
 * browse, putting back what the Layer had when the Library opened. When
 * creating the Layer opened the Library and the Layer still has its
 * generated name and first Target, Escape removes it instead, so backing
 * out leaves no empty Layer. Either way focus returns to the Layer's
 * navigator row. Selecting another Visual or Filter Layer rebinds the
 * Library to it; selecting anything else closes it.
 */
function LayerLibraryView({
  view,
  layerId,
}: {
  readonly view: DocumentView;
  readonly layerId: string;
}) {
  const { open, close } = useBrowser();
  const { selection } = useSelection();
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]);
  const layer = layers?.[layerId];
  const bound: VisualLayer | FilterLayer | undefined =
    layer === undefined || layer.kind === "group" ? undefined : layer;

  useEffect(() => {
    if (selection?.kind === "layer") {
      const target = layers?.[selection.id];
      if (target !== undefined && target.kind !== "group") {
        if (selection.id !== layerId) open(selection.id);
        return;
      }
    }
    close();
  }, [selection, layers, layerId, open, close]);

  useEffect(() => {
    if (bound === undefined) close();
  }, [bound, close]);

  if (bound === undefined) return null;
  return <LayerBrowser key={layerId} view={view} layer={bound} />;
}

function LayerBrowser({
  view,
  layer,
}: {
  readonly view: DocumentView;
  readonly layer: VisualLayer | FilterLayer;
}) {
  const command = useCommand(view);
  const { close, binding } = useBrowser();
  const created = binding?.created === true;
  const labels = pickLabels[layer.kind];
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Facets>(ANY_FACETS);
  // Captured once per binding: the Layer as it was before browsing.
  const restore = useRef<RestorePoint>({
    id: definitionOf(layer).id,
    parameters: layer.parameters,
  });
  // The name and Target creation gave the Layer: while both hold, the Layer
  // is still as creation made it, whatever the browse previews.
  const [made] = useState(() => ({
    name: layer.name,
    target: targetOf(layer),
  }));
  const untouched =
    created && layer.name === made.name && targetOf(layer) === made.target;

  const { id: currentId, definition: current } = definitionOf(layer);
  const ranked = useMemo(() => {
    const all: readonly Definition[] =
      layer.kind === "visual" ? catalog.visuals() : catalog.filters();
    return rankDefinitions(all, query, facets);
  }, [layer.kind, query, facets]);

  const apply = (id: string | null, parameters?: ParameterValues): void => {
    void command(labels.command, {
      layerId: layer.id,
      [layer.kind]: id,
      ...(parameters === undefined ? {} : { parameters }),
    });
  };

  /** Closes and hands focus back to the Layer's row, or to the inspector's "Swap…" button. */
  const leave = (): void => {
    close();
    focusNavigatorRow(
      layer.id,
      `[data-library-open="${CSS.escape(layer.id)}"]`,
    );
  };

  const onEscape = (): void => {
    if (untouched) {
      close();
      removeFocusingNeighbour(layer.id, () =>
        command("layer.remove", { layerId: layer.id }),
      );
      return;
    }
    const { id, parameters } = restore.current;
    if (id !== currentId || parameters !== layer.parameters)
      apply(id, id === null ? undefined : parameters);
    leave();
  };

  return (
    <LibraryShell
      title={
        <>
          <span className="font-medium">{labels.plural} for</span>
          <span className="min-w-0 truncate">{layer.name}</span>
        </>
      }
      hint={`${currentId === null && ranked.length > 0 ? "Enter picks the first" : "Enter keeps"}, ${untouched ? "Esc removes the new Layer" : "Esc discards"}`}
      searchLabel={`Search ${labels.plural}`}
      query={query}
      onQuery={setQuery}
      facets={
        <>
          <FacetControl
            label="Backend"
            value={facets.backend}
            options={[
              { value: "any", label: "Any" },
              { value: "canvas", label: "Canvas" },
              { value: "shader", label: "Shader" },
            ]}
            onChange={(backend) => setFacets({ ...facets, backend })}
          />
          {layer.kind === "visual" && (
            <FacetControl
              label="Path"
              value={facets.path}
              options={[
                { value: "any", label: "Any" },
                { value: "uses", label: "Uses" },
                { value: "none", label: "None" },
              ]}
              onChange={(path) => setFacets({ ...facets, path })}
            />
          )}
          <FacetControl
            label="Cues"
            value={facets.cues}
            options={[
              { value: "any", label: "Any" },
              { value: "has", label: "Has" },
              { value: "none", label: "None" },
            ]}
            onChange={(cues) => setFacets({ ...facets, cues })}
          />
        </>
      }
      description={
        <Description
          kind={layer.kind}
          current={current}
          currentId={currentId}
        />
      }
      entries={ranked}
      currentId={currentId}
      empty={`No ${labels.plural} match.`}
      onApply={(id) => apply(id)}
      onEnter={(focused) => {
        const pick = pickOnEnter(currentId, ranked, focused);
        if (pick !== undefined) apply(pick);
        leave();
      }}
      onEscape={onEscape}
      onClose={close}
      onReset={() => {
        setQuery("");
        setFacets(ANY_FACETS);
      }}
      renderTile={(definition, isCurrent) => (
        <LibraryTile
          key={definition.id}
          definition={definition}
          current={isCurrent}
          onPick={() => apply(definition.id)}
        />
      )}
    />
  );
}

function targetOf(layer: VisualLayer | FilterLayer): string | null {
  return layer.kind === "visual" ? layer.target : null;
}
