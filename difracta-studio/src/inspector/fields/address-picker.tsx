import { Check, Link2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchTier } from "@/library/search";

/** One Address on offer: what it is, where it sits, and the words that find it. */
export interface PickerCandidate {
  /** The Address; the picker hands the picked ones back. */
  readonly key: string;
  /** Heading the row is listed under: its Scene, "Controllers", "Installation". */
  readonly group: string;
  /** The owner, such as the Layer's name; empty for the Installation's own. */
  readonly owner: string;
  readonly label: string;
  /** Shown dimmed after the label, such as the Visual's name. */
  readonly detail?: string | undefined;
  /** Searched text, lower case. */
  readonly haystack: string;
  /** Shown ticked and not selectable, with this word at the right. */
  readonly taken?: string | undefined;
  /** A remark at the right, such as the Controller already driving it. */
  readonly note?: { readonly text: string; readonly title: string } | undefined;
}

/**
 * Picks any number of Addresses: searched word by word over their owner,
 * label and detail, grouped under headings, ticked one by one or all at
 * once, and handed back in one step. Enter ticks the highlighted row,
 * Ctrl+Enter submits.
 */
export function AddressPicker({
  title,
  testId,
  candidates,
  empty,
  submitLabel,
  onSubmit,
  onClose,
}: {
  readonly title: string;
  readonly testId: string;
  readonly candidates: readonly PickerCandidate[];
  /** Shown when there is nothing to pick at all. */
  readonly empty: string;
  readonly submitLabel: (count: number) => string;
  readonly onSubmit: (keys: readonly string[]) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState(0);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = candidates.filter((candidate) =>
    words.every((word) => matchesWord(word, candidate.haystack)),
  );
  const selectable = shown.filter((candidate) => candidate.taken === undefined);
  const allPicked =
    selectable.length > 0 &&
    selectable.every((candidate) => picked.has(candidate.key));
  const current = Math.min(highlighted, Math.max(0, shown.length - 1));

  function toggle(candidate: PickerCandidate): void {
    if (candidate.taken !== undefined) return;
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(candidate.key)) next.delete(candidate.key);
      else next.add(candidate.key);
      return next;
    });
  }

  function toggleAll(): void {
    setPicked((previous) => {
      const next = new Set(previous);
      for (const candidate of selectable)
        if (allPicked) next.delete(candidate.key);
        else next.add(candidate.key);
      return next;
    });
  }

  function submit(): void {
    const keys = candidates
      .map((candidate) => candidate.key)
      .filter((key) => picked.has(key));
    if (keys.length === 0) return;
    onClose();
    onSubmit(keys);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "ArrowDown")
      setHighlighted(Math.min(current + 1, shown.length - 1));
    else if (event.key === "ArrowUp") setHighlighted(Math.max(current - 1, 0));
    else if (event.key === "Enter") {
      if (event.ctrlKey || event.metaKey) submit();
      else {
        const candidate = shown[current];
        if (candidate !== undefined) toggle(candidate);
      }
    } else return;
    event.preventDefault();
  }

  const groups: { readonly name: string; readonly rows: PickerCandidate[] }[] =
    [];
  for (const candidate of shown) {
    const last = groups[groups.length - 1];
    if (last?.name === candidate.group) last.rows.push(candidate);
    else groups.push({ name: candidate.group, rows: [candidate] });
  }
  let index = -1;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        data-testid={testId}
        onKeyDown={onKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            aria-label="Search Parameters"
            placeholder="Scene, Layer, Visual or Parameter…"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setHighlighted(0);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={selectable.length === 0}
            onClick={toggleAll}
          >
            {allPicked ? "Clear results" : "Select all results"}
          </Button>
        </div>
        <div
          className="max-h-[50vh] min-h-32 overflow-auto rounded-md border"
          role="listbox"
          aria-multiselectable
          aria-label="Parameters"
        >
          {shown.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {candidates.length === 0 ? empty : "Nothing matches."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name}>
                <div className="sticky top-0 bg-popover px-2 py-1 text-[0.625rem] font-medium tracking-wider text-muted-foreground/80 uppercase">
                  {group.name}
                </div>
                {group.rows.map((candidate) => {
                  index += 1;
                  const at = index;
                  const on =
                    candidate.taken !== undefined || picked.has(candidate.key);
                  return (
                    <button
                      key={candidate.key}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={candidate.taken !== undefined}
                      data-highlighted={at === current || undefined}
                      className={cn(
                        "flex h-7 w-full items-center gap-2 px-2 text-left text-xs hover:bg-accent disabled:opacity-60",
                        at === current && "bg-accent/60",
                      )}
                      onMouseEnter={() => setHighlighted(at)}
                      onClick={() => toggle(candidate)}
                    >
                      <span
                        className={cn(
                          "grid size-3.5 shrink-0 place-items-center rounded-[3px] border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {on && <Check className="size-2.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {candidate.owner !== "" && (
                          <>
                            <span>{candidate.owner}</span>
                            <span className="text-muted-foreground/60">
                              {" · "}
                            </span>
                          </>
                        )}
                        <span>{candidate.label}</span>
                        {candidate.detail !== undefined && (
                          <span className="ml-2 text-muted-foreground">
                            {candidate.detail}
                          </span>
                        )}
                      </span>
                      {candidate.taken !== undefined && (
                        <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                          {candidate.taken}
                        </span>
                      )}
                      {candidate.note !== undefined && (
                        <span
                          className="flex shrink-0 items-center gap-1 text-[0.625rem] text-muted-foreground"
                          title={candidate.note.title}
                        >
                          <Link2 className="size-2.5" />
                          {candidate.note.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0} onClick={submit}>
            {submitLabel(picked.size)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A query word matches a haystack word it starts, or whose letters it names in order. */
function matchesWord(word: string, haystack: string): boolean {
  return haystack
    .split(" ")
    .some((candidate) => matchTier(word, candidate) !== undefined);
}
