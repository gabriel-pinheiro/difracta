import type { DocumentView } from "@difracta/client";
import {
  namedAfter,
  type Media,
  type MediaBundled,
  type Table,
} from "@difracta/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import {
  focusNavigatorRow,
  removeFocusingNeighbour,
} from "@/navigator/focus-row";
import { useSelection, type Selection } from "@/selection/selection";

import { useBrowser, type LibraryBinding } from "./browser-state";
import { FacetControl } from "./facet-control";
import { LibraryShell } from "./library-shell";
import { LibraryTile } from "./library-tile";
import { MediaDescription } from "./media-description";
import { ANY_MEDIA_FACETS, rankMedia, type MediaFacets } from "./media-search";

type MediaBinding = Extract<LibraryBinding, { readonly kind: "media" }>;

/**
 * The Library bound to one bundled Media item: the Bundled Media as a grid
 * of tiles. Clicking a tile or moving with the arrow keys points the item
 * at that entry at once, so anything showing it on the Outputs is the
 * preview. Enter keeps the pick; Escape puts back the entry the item had
 * when the Library opened, or, when creating the item opened the Library
 * and its name still follows the entries, removes it again, putting back
 * what the media Parameter held when the browse was opened from one.
 * Selecting another bundled item rebinds the Library to it; selecting
 * anything else closes it, except the Layer or Macro a Parameter browse
 * began from.
 */
export function MediaLibraryView({
  view,
  binding,
}: {
  readonly view: DocumentView;
  readonly binding: MediaBinding;
}) {
  const { openMedia, close } = useBrowser();
  const { selection } = useSelection();
  const media = useDocumentPath<Table<Media>>(view, ["media"]);
  const item = media?.[binding.id];
  const bound = item?.kind === "bundled" ? item : undefined;
  const anchor = binding.parameter?.anchor;

  useEffect(() => {
    if (selection?.kind === "media") {
      if (selection.id === binding.id) return;
      if (media?.[selection.id]?.kind === "bundled") {
        openMedia(selection.id);
        return;
      }
    }
    if (anchor !== undefined && sameSelection(selection, anchor)) return;
    close();
  }, [selection, media, binding.id, anchor, openMedia, close]);

  useEffect(() => {
    if (bound === undefined) close();
  }, [bound, close]);

  if (bound === undefined) return null;
  return (
    <MediaBrowser
      key={`${binding.id}:${String(binding.created)}`}
      view={view}
      item={bound}
      binding={binding}
    />
  );
}

function MediaBrowser({
  view,
  item,
  binding,
}: {
  readonly view: DocumentView;
  readonly item: MediaBundled;
  readonly binding: MediaBinding;
}) {
  const command = useCommand(view);
  const { close } = useBrowser();
  const parameter = binding.parameter;
  const accepts = parameter?.accepts;
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<MediaFacets>(ANY_MEDIA_FACETS);
  // Captured once per binding: the entry before browsing.
  const restore = useRef(item.bundled);
  const current = catalog.mediaEntry(item.bundled);
  // A new item whose name still follows the entries is as creation made it.
  const untouched =
    binding.created &&
    current !== undefined &&
    namedAfter(item.name, current.name);
  const ranked = useMemo(
    () => rankMedia(catalog.media(), query, facets, accepts),
    [query, facets, accepts],
  );

  const apply = (bundled: string): void => {
    if (bundled !== item.bundled)
      void command("media.bundled", { mediaId: item.id, bundled });
  };

  const returnFocus = (): void => {
    if (parameter?.returnFocus === undefined)
      focusNavigatorRow(
        item.id,
        `[data-library-open="${CSS.escape(item.id)}"]`,
      );
    else
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(parameter.returnFocus ?? "")
          ?.focus(),
      );
  };

  const leave = (): void => {
    close();
    returnFocus();
  };

  const onEscape = (): void => {
    if (!untouched) {
      apply(restore.current);
      leave();
      return;
    }
    close();
    parameter?.restore();
    const remove = () => command("media.remove", { mediaId: item.id });
    if (parameter === undefined) removeFocusingNeighbour(item.id, remove);
    else void remove().then(returnFocus);
  };

  const noun =
    accepts === "image" ? "images" : accepts === "video" ? "videos" : "";
  return (
    <LibraryShell
      title={
        <>
          <span className="font-medium">Bundled Media for</span>
          <span className="min-w-0 truncate">{item.name}</span>
        </>
      }
      hint={`Enter keeps, ${untouched ? "Esc removes the new item" : "Esc discards"}`}
      searchLabel="Search Bundled Media"
      query={query}
      onQuery={setQuery}
      facets={
        <>
          <FacetControl
            label="Loop"
            value={facets.loop}
            options={[
              { value: "any", label: "Any" },
              { value: "yes", label: "Yes" },
            ]}
            onChange={(loop) => setFacets({ ...facets, loop })}
          />
          <FacetControl
            label="Hit"
            value={facets.hit}
            options={[
              { value: "any", label: "Any" },
              { value: "yes", label: "Yes" },
            ]}
            onChange={(hit) => setFacets({ ...facets, hit })}
          />
          {noun !== "" && (
            <span className="text-[0.6875rem] text-muted-foreground">
              Only {noun}: the Parameter takes{" "}
              {noun === "images" ? "an image" : "a video"}.
            </span>
          )}
        </>
      }
      description={
        <MediaDescription current={current} currentId={item.bundled} />
      }
      entries={ranked}
      currentId={item.bundled}
      empty="No Bundled Media match."
      onApply={apply}
      onEnter={() => leave()}
      onEscape={onEscape}
      onClose={close}
      onReset={() => {
        setQuery("");
        setFacets(ANY_MEDIA_FACETS);
      }}
      renderTile={(entry, isCurrent) => (
        <LibraryTile
          key={entry.id}
          definition={entry}
          current={isCurrent}
          onPick={() => apply(entry.id)}
        />
      )}
    />
  );
}

function sameSelection(
  selection: Selection | undefined,
  anchor: Selection,
): boolean {
  if (selection?.kind !== anchor.kind) return false;
  if (!("id" in anchor)) return true;
  return "id" in selection && selection.id === anchor.id;
}
