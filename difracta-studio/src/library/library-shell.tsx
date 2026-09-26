import { Search, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What every Library binding shares: the header with its keyboard hint, the
 * search field and facets, the description strip, and the grid of tiles
 * with arrow keys moving the pick. The binding decides what a pick does,
 * what Enter keeps and what Escape puts back.
 */
export function LibraryShell<TEntry extends { readonly id: string }>({
  title,
  hint,
  searchLabel,
  query,
  onQuery,
  facets,
  description,
  entries,
  currentId,
  empty,
  onApply,
  onEnter,
  onEscape,
  onClose,
  onReset,
  renderTile,
}: {
  readonly title: ReactNode;
  readonly hint: string;
  readonly searchLabel: string;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly facets: ReactNode;
  readonly description: ReactNode;
  /** The ranked entries, in grid order. */
  readonly entries: readonly TEntry[];
  readonly currentId: string | null;
  /** Shown when nothing matches, before the reset link. */
  readonly empty: string;
  readonly onApply: (id: string) => void;
  /** Enter, with the tile that had keyboard focus if one did. */
  readonly onEnter: (focusedId: string | undefined) => void;
  readonly onEscape: () => void;
  readonly onClose: () => void;
  /** Clears the query and the facets. */
  readonly onReset: () => void;
  /** One tile; it carries `data-id` with the entry's id. */
  readonly renderTile: (entry: TEntry, current: boolean) => ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (currentId === null) return;
    gridRef.current
      ?.querySelector(`[data-id="${CSS.escape(currentId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  const moveBy = (step: number): void => {
    if (entries.length === 0) return;
    const index = entries.findIndex((entry) => entry.id === currentId);
    const next =
      index === -1
        ? 0
        : Math.min(entries.length - 1, Math.max(0, index + step));
    const target = entries[next];
    if (target !== undefined && target.id !== currentId) onApply(target.id);
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
        onEnter(
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>("[data-testid='library-tile']")
                ?.dataset.id
            : undefined,
        );
        break;
      case "Escape":
        onEscape();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const reset = (): void => {
    onReset();
    inputRef.current?.focus();
  };

  return (
    <div
      data-testid="library"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={onKeyDown}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b px-2 text-xs">
        {title}
        <span className="ml-auto truncate text-[0.6875rem] text-muted-foreground">
          {hint}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close the Library"
          title="Close the Library"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-2 py-1.5">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            aria-label={searchLabel}
            placeholder={searchLabel}
            className="pl-6"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        {facets}
      </div>
      {description}
      {entries.length === 0 ? (
        <p className="p-3 text-muted-foreground">
          {empty}{" "}
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
          {entries.map((entry) => renderTile(entry, entry.id === currentId))}
        </div>
      )}
    </div>
  );
}
