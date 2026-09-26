import type { MediaDefinition, MediaType } from "@difracta/core";

import { rankEntries } from "./search";

/**
 * Finding a Bundled Media entry: ranked as Visuals and Filters are, with its
 * notes searched too, narrowed by two facets (seamless loops, one-shot
 * hits) and, when the Library picks for a media Parameter, by the type the
 * Parameter accepts.
 */
export interface MediaFacets {
  readonly loop: "any" | "yes";
  readonly hit: "any" | "yes";
}

export const ANY_MEDIA_FACETS: MediaFacets = { loop: "any", hit: "any" };

export function matchesMediaFacets(
  entry: MediaDefinition,
  facets: MediaFacets,
  accepts?: MediaType,
): boolean {
  if (accepts !== undefined && entry.type !== accepts) return false;
  if (facets.loop === "yes" && entry.loop !== true) return false;
  if (facets.hit === "yes" && entry.hit !== true) return false;
  return true;
}

export function rankMedia(
  entries: readonly MediaDefinition[],
  query: string,
  facets: MediaFacets = ANY_MEDIA_FACETS,
  accepts?: MediaType,
): readonly MediaDefinition[] {
  return rankEntries(
    entries,
    query,
    (entry) => matchesMediaFacets(entry, facets, accepts),
    { notes: true },
  );
}

/** The entry a new bundled item starts on: the first tile the Library shows with nothing narrowed. */
export function firstMedia(
  entries: readonly MediaDefinition[],
  accepts?: MediaType,
): MediaDefinition | undefined {
  return rankMedia(entries, "", ANY_MEDIA_FACETS, accepts)[0];
}
