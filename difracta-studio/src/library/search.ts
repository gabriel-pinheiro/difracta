import { hasCues, usesPath, type Definition } from "@difracta/core";

/**
 * Finding a definition in the Catalog: a query and three facets narrow the
 * list, and the order puts the best match first. With a query, a name that
 * starts with it beats a name with a word starting with it, which beats a
 * name merely containing its letters in order, and any name match beats a
 * description with a word starting with the query. Letters in order are
 * only tried on names: over a description they match nearly everything.
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

/** Lower is better; undefined when the definition does not match the query. */
export function score(
  definition: Definition,
  query: string,
): number | undefined {
  const name = matchTier(query, definition.name);
  if (name !== undefined) return name;
  const description = matchTier(query, definition.description, false);
  return description === undefined ? undefined : 3 + description;
}

const byName = (a: Definition, b: Definition): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const byRecommended = (a: Definition, b: Definition): number =>
  Number(b.recommended === true) - Number(a.recommended === true);

export function rankDefinitions<TDefinition extends Definition>(
  definitions: readonly TDefinition[],
  query: string,
  facets: Facets = ANY_FACETS,
): readonly TDefinition[] {
  const needle = query.trim().toLowerCase();
  const candidates = definitions.filter((definition) =>
    matchesFacets(definition, facets),
  );
  if (needle === "")
    return [...candidates].sort((a, b) => byRecommended(a, b) || byName(a, b));
  const scored = candidates.flatMap((definition) => {
    const rank = score(definition, needle);
    return rank === undefined ? [] : [{ definition, rank }];
  });
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        byRecommended(a.definition, b.definition) ||
        byName(a.definition, b.definition),
    )
    .map((entry) => entry.definition);
}

/**
 * What Enter applies before the Library closes: nothing while the Layer
 * already holds a pick, since Enter keeps it; otherwise the focused tile, or
 * else the first result, so typing a name and pressing Enter picks it.
 */
export function pickOnEnter(
  currentId: string | null,
  ranked: readonly Definition[],
  focusedId?: string,
): string | undefined {
  if (currentId !== null) return undefined;
  return focusedId ?? ranked[0]?.id;
}
