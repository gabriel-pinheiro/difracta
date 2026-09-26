import { hasCues, usesPath, type Definition } from "@difracta/core";

/**
 * Finding an entry in the Catalog: a query and facets narrow the list, and
 * the order puts the best match first. With a query, a name that
 * starts with it beats a name with a word starting with it, which beats a
 * name merely containing its letters in order, and any name match beats a
 * description with a word starting with the query. Letters in order are
 * only tried on names: over a description they match nearly everything.
 * Bundled Media searches its notes too, after descriptions.
 * Recommended entries break ties, then the name. Without a query the
 * recommended entries come first, then names.
 */
export interface Facets {
  readonly backend: "any" | "canvas" | "shader";
  readonly path: "any" | "uses" | "none";
  readonly cues: "any" | "has" | "none";
}

export const ANY_FACETS: Facets = { backend: "any", path: "any", cues: "any" };

export function matchesFacets(definition: Definition, facets: Facets): boolean {
  if (facets.backend !== "any" && definition.backend !== facets.backend)
    return false;
  if (
    facets.path !== "any" &&
    usesPath(definition) !== (facets.path === "uses")
  )
    return false;
  if (facets.cues !== "any" && hasCues(definition) !== (facets.cues === "has"))
    return false;
  return true;
}

/** Whether every character of `query` appears in `text` in order. */
export function isSubsequence(query: string, text: string): boolean {
  let at = 0;
  for (const character of query) {
    at = text.indexOf(character, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}

/** 0 prefix, 1 word prefix, 2 letters in order (names only); undefined when `text` does not match. */
export function matchTier(
  query: string,
  text: string,
  fuzzy = true,
): 0 | 1 | 2 | undefined {
  const haystack = text.toLowerCase();
  if (haystack.startsWith(query)) return 0;
  if (haystack.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (fuzzy && isSubsequence(query.replaceAll(" ", ""), haystack)) return 2;
  return undefined;
}

/** What ranking reads of a Catalog entry: a Visual, a Filter or a Bundled Media entry. */
export interface Rankable {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly notes?: string;
  readonly recommended?: boolean;
}

/**
 * Lower is better; undefined when the entry does not match the query. With
 * `notes`, a word of the notes starting with the query matches last.
 */
export function score(
  entry: Rankable,
  query: string,
  notes = false,
): number | undefined {
  const name = matchTier(query, entry.name);
  if (name !== undefined) return name;
  const description = matchTier(query, entry.description, false);
  if (description !== undefined) return 3 + description;
  if (!notes || entry.notes === undefined) return undefined;
  const note = matchTier(query, entry.notes, false);
  return note === undefined ? undefined : 5 + note;
}

const byName = (a: Rankable, b: Rankable): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const byRecommended = (a: Rankable, b: Rankable): number =>
  Number(b.recommended === true) - Number(a.recommended === true);

/** Entries passing `matches`, ordered for `query` as the module comment says. */
export function rankEntries<TEntry extends Rankable>(
  entries: readonly TEntry[],
  query: string,
  matches: (entry: TEntry) => boolean = () => true,
  { notes = false }: { readonly notes?: boolean } = {},
): readonly TEntry[] {
  const needle = query.trim().toLowerCase();
  const candidates = entries.filter(matches);
  if (needle === "")
    return [...candidates].sort((a, b) => byRecommended(a, b) || byName(a, b));
  const scored = candidates.flatMap((entry) => {
    const rank = score(entry, needle, notes);
    return rank === undefined ? [] : [{ entry, rank }];
  });
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        byRecommended(a.entry, b.entry) ||
        byName(a.entry, b.entry),
    )
    .map(({ entry }) => entry);
}

export function rankDefinitions<TDefinition extends Definition>(
  definitions: readonly TDefinition[],
  query: string,
  facets: Facets = ANY_FACETS,
): readonly TDefinition[] {
  return rankEntries(definitions, query, (definition) =>
    matchesFacets(definition, facets),
  );
}

/**
 * What Enter applies before the Library closes: nothing while the Layer
 * already holds a pick, since Enter keeps it; otherwise the focused tile, or
 * else the first result, so typing a name and pressing Enter picks it.
 */
export function pickOnEnter(
  currentId: string | null,
  ranked: readonly Rankable[],
  focusedId?: string,
): string | undefined {
  if (currentId !== null) return undefined;
  return focusedId ?? ranked[0]?.id;
}
