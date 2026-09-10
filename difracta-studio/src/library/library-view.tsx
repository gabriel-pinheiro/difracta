import type { DocumentView } from "@difracta/client";
import type {
  Definition,
  FilterLayer,
  Layer,
  ParameterValues,
  Table,
  VisualLayer,
} from "@difracta/core";
import { Search, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalog, definitionOf, pickLabels } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { useBrowser } from "./browser-state";
import { FacetControl } from "./facet-control";
import { LibraryTile } from "./library-tile";
import { ANY_FACETS, rankDefinitions, type Facets } from "./search";

/** What the bound Layer held when the Library opened, so Escape can put it back. */
interface RestorePoint {
  readonly id: string | null;
  readonly parameters: ParameterValues;
}

/**
 * The Library: the Catalog as a grid of tiles, bound to one Visual or Filter
 * Layer. Clicking a tile or moving with the arrow keys applies it to the
 * Layer at once, so the Outputs are the preview; Enter keeps the pick and
 * Escape discards the browse, putting back what the Layer had when the
 * Library opened. Selecting
 * another Visual or Filter Layer rebinds the Library to it; selecting
 * anything else closes it.
 */
export function LibraryView({
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
  return <Browser key={layerId} view={view} layer={bound} />;
}

function Browser({
  view,
  layer,
}: {
  readonly view: DocumentView;
  readonly layer: VisualLayer | FilterLayer;
}) {
  const command = useCommand(view);
  const { close } = useBrowser();
  const labels = pickLabels[layer.kind];
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Facets>(ANY_FACETS);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  // Captured once per binding: the Layer as it was before browsing.
  const restore = useRef<RestorePoint>({
    id: definitionOf(layer).id,
    parameters: layer.parameters,
  });

  const { id: currentId, definition: current } = definitionOf(layer);
  const ranked = useMemo(() => {
    const all: readonly Definition[] =
      layer.kind === "visual" ? catalog.visuals() : catalog.filters();
    return rankDefinitions(all, query, facets);
  }, [layer.kind, query, facets]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (currentId === null) return;
    tiles.current.get(currentId)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  const apply = (id: string | null, parameters?: ParameterValues): void => {
    void command(labels.command, {
      layerId: layer.id,
      [layer.kind]: id,
      ...(parameters === undefined ? {} : { parameters }),
    });
  };

  const moveBy = (step: number): void => {
    if (ranked.length === 0) return;
    const index = ranked.findIndex((entry) => entry.id === currentId);
    const next =
      index === -1 ? 0 : Math.min(ranked.length - 1, Math.max(0, index + step));
    const target = ranked[next];
    if (target !== undefined && target.id !== currentId) apply(target.id);
  };

  const columns = (): number => {
    const grid = gridRef.current;
    if (grid === null) return 1;
    return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const inInput = event.target === inputRef.current;
    switch (event.key) {
      case "ArrowDown":
        moveBy(columns());
        break;
      case "ArrowUp":
        moveBy(-columns());
        break;
      case "ArrowRight":
        if (inInput && query !== "") return;
        moveBy(1);
        break;
      case "ArrowLeft":
        if (inInput && query !== "") return;
        moveBy(-1);
        break;
      case "Enter":
        close();
        break;
      case "Escape": {
        const { id, parameters } = restore.current;
        if (id !== currentId || parameters !== layer.parameters)
          apply(id, id === null ? undefined : parameters);
        close();
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const reset = (): void => {
    setQuery("");
    setFacets(ANY_FACETS);
    inputRef.current?.focus();
  };

  return (
    <div
      data-testid="library"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={onKeyDown}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b px-2 text-xs">
        <span className="font-medium">{labels.plural} for</span>
        <span className="min-w-0 truncate">{layer.name}</span>
        <span className="ml-auto truncate text-[0.6875rem] text-muted-foreground">
          Enter keeps, Esc discards
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close the Library"
          title="Close the Library"
          onClick={close}
        >
          <X />
        </Button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-2 py-1.5">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            aria-label={`Search ${labels.plural}`}
            placeholder={`Search ${labels.plural}`}
            className="pl-6"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
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
      </div>
      <Description kind={layer.kind} current={current} currentId={currentId} />
      {ranked.length === 0 ? (
        <p className="p-3 text-muted-foreground">
          No {labels.plural} match.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={reset}
          >
            Reset the search and facets
          </button>
        </p>
      ) : (
        <div
          ref={gridRef}
          className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start gap-2 overflow-auto p-2"
        >
          {ranked.map((definition) => (
            <LibraryTile
              key={definition.id}
              ref={(element) => {
                if (element === null) tiles.current.delete(definition.id);
                else tiles.current.set(definition.id, element);
              }}
              definition={definition}
              current={definition.id === currentId}
              onPick={() => apply(definition.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The current pick's description, or how to start. */
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
