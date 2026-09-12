import type { DocumentView } from "@difracta/client";
import {
  linkAt,
  linkable,
  listAddresses,
  orderedEntries,
  type Controller,
  type Document,
  type ResolvedAddress,
} from "@difracta/core";
import { Check, Link2 } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { catalog, definitionOf } from "@/lib/catalog";
import { useCommand, useSignal } from "@/lib/client";
import { matchTier } from "@/library/search";
import { cn } from "@/lib/utils";

interface Candidate {
  readonly resolved: ResolvedAddress;
  readonly layerId: string;
  readonly layerName: string;
  readonly sceneId: string;
  readonly sceneName: string;
  readonly definitionName: string;
  /** Searched text: Scene, Layer, Visual and Parameter names. */
  readonly haystack: string;
  /** Name of the Controller already driving it, when another one does. */
  readonly linkedElsewhere: string | undefined;
  /** Already driven by this Controller. */
  readonly linked: boolean;
}

/**
 * Picks the Addresses a Controller will drive: every compatible one in the
 * Installation, searched by Scene, Layer, Visual and Parameter name, ticked
 * in any number and linked in one step. Built for "this Controller onto the
 * same Parameter of thirty Layers": type two words, select all, link.
 */
export function LinkPicker({
  view,
  controller,
  onClose,
}: {
  readonly view: DocumentView;
  readonly controller: Controller & { readonly kind: "number" | "color" };
  readonly onClose: () => void;
}) {
  const command = useCommand(view);
  const document = useSignal(view.document);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState(0);
  const candidates = useMemo(
    () => (document === undefined ? [] : collect(document, controller)),
    [document, controller],
  );
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = candidates.filter((candidate) =>
    words.every((word) => matchesWord(word, candidate.haystack)),
  );
  const selectable = shown.filter((candidate) => !candidate.linked);
  const allPicked =
    selectable.length > 0 &&
    selectable.every((candidate) => picked.has(candidate.resolved.address));
  const current = Math.min(highlighted, Math.max(0, shown.length - 1));

  function toggle(candidate: Candidate): void {
    if (candidate.linked) return;
    setPicked((previous) => {
      const next = new Set(previous);
      const key = candidate.resolved.address;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(): void {
    setPicked((previous) => {
      const next = new Set(previous);
      for (const candidate of selectable)
        if (allPicked) next.delete(candidate.resolved.address);
        else next.add(candidate.resolved.address);
      return next;
    });
  }

  function link(): void {
    const addresses = [...picked];
    if (addresses.length === 0) return;
    onClose();
    void command("link.create", { controllerId: controller.id, addresses });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "ArrowDown")
      setHighlighted(Math.min(current + 1, shown.length - 1));
    else if (event.key === "ArrowUp") setHighlighted(Math.max(current - 1, 0));
    else if (event.key === "Enter") {
      if (event.ctrlKey || event.metaKey) link();
      else {
        const candidate = shown[current];
        if (candidate !== undefined) toggle(candidate);
      }
    } else return;
    event.preventDefault();
  }

  // Group the shown rows by Scene, in Scene order.
  const groups: { readonly sceneName: string; readonly rows: Candidate[] }[] =
    [];
  for (const candidate of shown) {
    const last = groups[groups.length - 1];
    if (last?.sceneName === candidate.sceneName) last.rows.push(candidate);
    else groups.push({ sceneName: candidate.sceneName, rows: [candidate] });
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
        data-testid="link-picker"
        onKeyDown={onKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Link to {controller.name}</DialogTitle>
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
              {candidates.length === 0
                ? "No compatible Parameter in the Installation."
                : "Nothing matches."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.sceneName}>
                <div className="sticky top-0 bg-popover px-2 py-1 text-[0.625rem] font-medium tracking-wider text-muted-foreground/80 uppercase">
                  {group.sceneName}
                </div>
                {group.rows.map((candidate) => {
                  index += 1;
                  const at = index;
                  const key = candidate.resolved.address;
                  const on = candidate.linked || picked.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={candidate.linked}
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
                        <span>{candidate.layerName}</span>
                        <span className="text-muted-foreground/60"> · </span>
                        <span>{candidate.resolved.label}</span>
                        <span className="ml-2 text-muted-foreground">
                          {candidate.definitionName}
                        </span>
                      </span>
                      {candidate.linked && (
                        <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                          linked
                        </span>
                      )}
                      {candidate.linkedElsewhere !== undefined && (
                        <span
                          className="flex shrink-0 items-center gap-1 text-[0.625rem] text-muted-foreground"
                          title={`Controlled by ${candidate.linkedElsewhere}; linking moves it here`}
                        >
                          <Link2 className="size-2.5" />
                          {candidate.linkedElsewhere}
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
          <Button disabled={picked.size === 0} onClick={link}>
            Link {picked.size > 0 ? String(picked.size) : ""}
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

/** Every Address the Controller could drive, in Scene then Layer order. */
function collect(
  document: Document,
  controller: Controller & { readonly kind: "number" | "color" },
): Candidate[] {
  const sceneOrder = new Map<string, number>(
    orderedEntries(document.scenes).map((scene, position) => [
      scene.id,
      position,
    ]),
  );
  const result: Candidate[] = [];
  for (const resolved of listAddresses(document, catalog)) {
    if (!linkable(resolved, controller.kind)) continue;
    const layerId = resolved.path[1] ?? "";
    const layer = document.layers[layerId];
    if (layer === undefined || layer.kind === "group") continue;
    const scene = document.scenes[layer.sceneId];
    const definitionName = definitionOf(layer).definition?.name ?? "";
    const existing = linkAt(document, resolved.address);
    result.push({
      resolved,
      layerId,
      layerName: layer.name,
      sceneId: layer.sceneId,
      sceneName: scene?.name ?? "",
      definitionName,
      haystack:
        `${scene?.name ?? ""} ${layer.name} ${definitionName} ${resolved.label}`.toLowerCase(),
      linked: existing?.controllerId === controller.id,
      linkedElsewhere:
        existing === undefined || existing.controllerId === controller.id
          ? undefined
          : (document.controllers[existing.controllerId]?.name ?? "another"),
    });
  }
  return result.sort(
    (a, b) =>
      (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0),
  );
}
