import type { FileMediaType } from "@difracta/core";
import { ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { FacetControl } from "./facet-control";
import {
  folderCrumbs,
  subfolders,
  tagCounts,
  type MediaRow,
  type MediaScope,
} from "./media-search";

/**
 * The facets over the Library's media rows: the Packs as chips (hidden
 * while browsing one Pack, which fixes it), the folder inside the Pack as
 * a breadcrumb with the next level down to click into, the tags occurring
 * among the rows that match everything else, each with its count, and the
 * type when the Library is not picking for a Parameter.
 */
export function MediaFacets({
  rows,
  ranked,
  scope,
  packs,
  fixedPack,
  typed,
  onScope,
}: {
  /** Every row, for the folders of the scoped Pack. */
  readonly rows: readonly MediaRow[];
  /** The rows matching the query and the scope, for the tag counts. */
  readonly ranked: readonly MediaRow[];
  readonly scope: MediaScope;
  /** The loaded Packs by id and name, as chips. */
  readonly packs: readonly { readonly id: string; readonly name: string }[];
  /** Browsing one Pack: no Pack chips. */
  readonly fixedPack: boolean;
  /** Picking for a Parameter: the type is fixed, no type facet. */
  readonly typed: boolean;
  readonly onScope: (scope: MediaScope) => void;
}) {
  const tags = tagCounts(ranked, scope.tags);
  const packRows =
    scope.packId === undefined
      ? []
      : rows.filter((row) => row.packId === scope.packId);
  const below = subfolders(packRows, scope.folder);
  const crumbs = folderCrumbs(scope.folder ?? "");
  const toggleTag = (tag: string): void => {
    const key = tag.toLowerCase();
    const picked = scope.tags.some(
      (candidate) => candidate.toLowerCase() === key,
    );
    onScope({
      ...scope,
      tags: picked
        ? scope.tags.filter((candidate) => candidate.toLowerCase() !== key)
        : [...scope.tags, tag],
    });
  };
  return (
    <>
      {!fixedPack && packs.length > 1 && (
        <div
          role="group"
          aria-label="Pack"
          className="flex items-center gap-1 text-[0.6875rem]"
        >
          <span className="text-muted-foreground">Pack</span>
          <Chip
            pressed={scope.packId === undefined}
            onClick={() =>
              onScope({ ...scope, packId: undefined, folder: undefined })
            }
          >
            All
          </Chip>
          {packs.map((pack) => (
            <Chip
              key={pack.id}
              pressed={scope.packId === pack.id}
              onClick={() =>
                onScope({ ...scope, packId: pack.id, folder: undefined })
              }
            >
              {pack.name}
            </Chip>
          ))}
        </div>
      )}
      {scope.packId !== undefined &&
        (crumbs.length > 0 || below.length > 0) && (
          <nav
            aria-label="Folder"
            className="flex items-center gap-0.5 text-[0.6875rem]"
          >
            <Crumb
              current={crumbs.length === 0}
              onClick={() => onScope({ ...scope, folder: undefined })}
            >
              {packs.find((pack) => pack.id === scope.packId)?.name ?? "Pack"}
            </Crumb>
            {crumbs.map((folder, index) => (
              <span key={folder} className="flex items-center gap-0.5">
                <ChevronRight className="size-3 text-muted-foreground" />
                <Crumb
                  current={index === crumbs.length - 1}
                  onClick={() => onScope({ ...scope, folder })}
                >
                  {folder.split("/").at(-1)}
                </Crumb>
              </span>
            ))}
            {below.map((folder) => (
              <Chip
                key={folder}
                pressed={false}
                onClick={() => onScope({ ...scope, folder })}
              >
                {folder.split("/").at(-1)}
              </Chip>
            ))}
          </nav>
        )}
      {!typed && (
        <FacetControl
          label="Type"
          value={scope.type ?? "any"}
          options={[
            { value: "any", label: "Any" },
            { value: "image", label: "Images" },
            { value: "video", label: "Videos" },
          ]}
          onChange={(type: "any" | FileMediaType) =>
            onScope({ ...scope, type: type === "any" ? undefined : type })
          }
        />
      )}
      {tags.length > 0 && (
        <div
          role="group"
          aria-label="Tags"
          className="flex flex-wrap items-center gap-1 text-[0.6875rem]"
        >
          <span className="text-muted-foreground">Tags</span>
          {tags.map((tag) => {
            const pressed = scope.tags.some(
              (candidate) =>
                candidate.toLowerCase() === tag.label.toLowerCase(),
            );
            return (
              <Chip
                key={tag.label.toLowerCase()}
                pressed={pressed}
                onClick={() => toggleTag(tag.label)}
              >
                {tag.label}
                <span className="text-muted-foreground tabular-nums">
                  {tag.count}
                </span>
                {pressed && <X className="size-2.5" />}
              </Chip>
            );
          })}
        </div>
      )}
    </>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-muted-foreground hover:text-foreground",
        pressed && "bg-input/50 text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Crumb({
  current,
  onClick,
  children,
}: {
  readonly current: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "location" : undefined}
      className={cn(
        "rounded-sm px-1 py-0.5 hover:text-foreground",
        current ? "text-foreground" : "text-muted-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
