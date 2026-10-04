import type { DocumentView } from "@difracta/client";
import {
  parseMediaReference,
  type PackAttachment,
  type Table,
} from "@difracta/core";
import type { LiveState } from "@difracta/protocol";
import { Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePackActions } from "@/entities/pack/pack-actions";
import { useDocumentPath } from "@/lib/client";
import { focusNavigatorRow } from "@/navigator/focus-row";
import { useSelection, type Selection } from "@/selection/selection";

import { useBrowser, type LibraryBinding } from "./browser-state";
import { LibraryShell } from "./library-shell";
import { MediaDescription } from "./media-description";
import { MediaFacets } from "./media-facets";
import {
  mediaRows,
  rankMediaRows,
  WHOLE_LIBRARY,
  type MediaScope,
} from "./media-search";
import { MediaTile } from "./media-tile";

type MediaBinding = Exclude<LibraryBinding, { readonly kind: "layer" }>;

const NO_PACKS: LiveState["packs"] = {};

/** The Pack an entry selection belongs to, or undefined for any other selection. */
const selectedEntryPack = (
  selection: Selection | undefined,
): string | undefined =>
  selection?.kind === "entry"
    ? parseMediaReference(selection.id)?.packId
    : undefined;

/**
 * The Library over the Packs' entries, in one of two modes. Browsing a Pack
 * (selected in the navigator): the grid is that Pack's, clicking a tile or
 * moving with the arrow keys selects the entry, so the inspector shows and
 * edits it, and sets nothing; the Library stays while the selection is the
 * Pack or one of its entries, rebinds when another Pack or another Pack's
 * entry is selected, and closes when the selection leaves Packs. Picking
 * for a media Address (a Layer's Parameter, a Macro action's value): the
 * grid is every loaded Pack's entries of the accepted type, clicking a tile
 * sets the Address at once so the Outputs are the preview, Enter keeps,
 * Escape puts back what it held, and the Library closes when the selection
 * leaves the Layer or Macro it began from; a strip above the grid describes
 * the entry the Address holds.
 */
export function MediaLibraryView({
  view,
  binding,
}: {
  readonly view: DocumentView;
  readonly binding: MediaBinding;
}) {
  const { openPack, close } = useBrowser();
  const { selection } = useSelection();
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const packId = binding.kind === "pack" ? binding.packId : undefined;
  const bundled = packId === "bundled";
  const present = packId === undefined || bundled || packId in attached;

  useEffect(() => {
    if (binding.kind === "pack") {
      const selectedPack =
        selection?.kind === "pack"
          ? selection.id
          : selectedEntryPack(selection);
      if (selectedPack === undefined) {
        close();
        return;
      }
      if (selectedPack !== binding.packId) openPack(selectedPack);
      return;
    }
    if (!sameSelection(selection, binding.anchor)) close();
  }, [binding, selection, openPack, close]);

  useEffect(() => {
    if (!present) close();
  }, [present, close]);

  if (!present) return null;
  const key =
    binding.kind === "pack"
      ? `pack:${binding.packId}`
      : `parameter:${binding.address}`;
  return <MediaBrowser key={key} view={view} binding={binding} />;
}

function MediaBrowser({
  view,
  binding,
}: {
  readonly view: DocumentView;
  readonly binding: MediaBinding;
}) {
  const { close } = useBrowser();
  const { selection, select } = useSelection();
  const actions = usePackActions(view);
  const packs =
    useDocumentPath<LiveState["packs"]>(view, ["live", "packs"]) ?? NO_PACKS;
  const rows = useMemo(() => mediaRows(packs), [packs]);
  const browsing = binding.kind === "pack";
  const [query, setQuery] = useState("");
  const initialScope = (): MediaScope =>
    binding.kind === "pack"
      ? { ...WHOLE_LIBRARY, packId: binding.packId, folder: binding.folder }
      : { ...WHOLE_LIBRARY, type: binding.accepts };
  const [scope, setScope] = useState<MediaScope>(initialScope);
  // Opened again on the same Pack with a folder: the grid scopes to it.
  const [seen, setSeen] = useState(binding);
  if (seen !== binding) {
    setSeen(binding);
    const folder = binding.kind === "pack" ? binding.folder : undefined;
    if (folder !== undefined)
      setScope((previous) => ({
        ...previous,
        folder: folder === "" ? undefined : folder,
      }));
  }
  // Picking: the reference the Address holds now. Browsing: the selected entry.
  const [picked, setPicked] = useState<string | null>(
    binding.kind === "parameter" && binding.initial !== ""
      ? binding.initial
      : null,
  );
  const current =
    binding.kind === "pack"
      ? selection?.kind === "entry" &&
        selectedEntryPack(selection) === binding.packId
        ? selection.id
        : null
      : picked;
  const ranked = useMemo(
    () => rankMediaRows(rows, query, scope),
    [rows, query, scope],
  );
  const packList = Object.entries(packs)
    .filter(([, pack]) => pack.status !== "missing")
    .map(([id, pack]) => ({ id, name: pack.name }));

  const apply = (reference: string): void => {
    if (binding.kind === "pack") {
      select({ kind: "entry", id: reference });
      return;
    }
    setPicked(reference);
    if (reference !== current) binding.apply(reference);
  };
  const leave = (): void => {
    close();
    if (binding.kind === "pack") focusNavigatorRow(binding.packId);
    else if (binding.returnFocus !== undefined)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(binding.returnFocus ?? "")?.focus(),
      );
  };
  const onEscape = (): void => {
    if (binding.kind === "parameter" && (current ?? "") !== binding.initial)
      binding.apply(binding.initial);
    leave();
  };

  const packName =
    binding.kind === "pack" ? (packs[binding.packId]?.name ?? "Pack") : "";
  const noun = binding.kind === "parameter" ? `${binding.accepts}s` : "media";
  const empty =
    rows.length === 0 ? (
      <div className="grid h-full place-items-center p-6">
        <Button
          size="lg"
          variant="outline"
          disabled={actions.gate !== undefined}
          title={actions.gate ?? "Make a folder of images and videos a Pack"}
          onClick={actions.addFromFolder}
        >
          <Package /> Add Pack…
        </Button>
      </div>
    ) : (
      `No ${noun} match.`
    );

  return (
    <LibraryShell
      title={
        binding.kind === "pack" ? (
          <>
            <span className="font-medium">Browsing</span>
            <span className="min-w-0 truncate">{packName}</span>
          </>
        ) : (
          <>
            <span className="font-medium">{binding.label} for</span>
            <span className="min-w-0 truncate">
              {binding.owner ?? binding.address}
            </span>
          </>
        )
      }
      hint={browsing ? "Esc closes" : "Enter keeps, Esc discards"}
      searchLabel={`Search ${browsing ? packName : noun}`}
      query={query}
      onQuery={setQuery}
      facets={
        <MediaFacets
          rows={rows}
          ranked={ranked}
          scope={scope}
          packs={packList}
          fixedPack={browsing}
          typed={!browsing}
          onScope={setScope}
        />
      }
      description={
        browsing ? undefined : (
          <MediaDescription
            current={rows.find((row) => row.reference === current)}
            currentId={current}
            noun={noun}
          />
        )
      }
      entries={ranked.map((row) => ({ id: row.reference, row }))}
      currentId={current}
      empty={empty}
      onApply={apply}
      onEnter={(focusedId) => {
        if (binding.kind === "parameter" && current === null) {
          const pick = focusedId ?? ranked[0]?.reference;
          if (pick !== undefined) apply(pick);
        }
        if (binding.kind === "parameter") leave();
      }}
      onEscape={onEscape}
      onClose={close}
      onReset={() => {
        setQuery("");
        setScope(
          binding.kind === "pack"
            ? { ...WHOLE_LIBRARY, packId: binding.packId }
            : { ...WHOLE_LIBRARY, type: binding.accepts },
        );
      }}
      renderTile={({ row }, isCurrent) => (
        <MediaTile
          key={row.reference}
          row={row}
          current={isCurrent}
          onPick={() => apply(row.reference)}
        />
      )}
    />
  );
}

function sameSelection(
  selection: Selection | undefined,
  anchor: Selection | undefined,
): boolean {
  if (anchor === undefined) return selection === undefined;
  if (selection?.kind !== anchor.kind) return false;
  if (!("id" in anchor)) return true;
  return "id" in selection && selection.id === anchor.id;
}
