/**
 * Editing an entry's tags in its Inspector. Tags are free-form, trimmed
 * and compared ignoring case; a tag typed in another case than the Pack
 * already uses takes the Pack's spelling, so one tag is never two chips.
 */

/** `tags` with `typed` added, in the Pack's spelling when `known` has it; unchanged when it is already there or empty. */
export function addTag(
  tags: readonly string[],
  typed: string,
  known: readonly string[],
): readonly string[] {
  const trimmed = typed.trim();
  if (trimmed === "") return tags;
  const key = trimmed.toLowerCase();
  if (tags.some((tag) => tag.toLowerCase() === key)) return tags;
  const spelling = known.find((tag) => tag.toLowerCase() === key) ?? trimmed;
  return [...tags, spelling];
}

export function removeTag(
  tags: readonly string[],
  tag: string,
): readonly string[] {
  const key = tag.toLowerCase();
  return tags.filter((candidate) => candidate.toLowerCase() !== key);
}

/** The tags the autocomplete offers: every tag the Pack's entries carry, less the entry's own, sorted. */
export function tagSuggestions(
  packTags: Iterable<string>,
  own: readonly string[],
): readonly string[] {
  const taken = new Set(own.map((tag) => tag.toLowerCase()));
  const seen = new Map<string, string>();
  for (const tag of packTags) {
    const key = tag.toLowerCase();
    if (!taken.has(key) && !seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** Why an entry of a read-only Pack cannot be edited. */
export const READ_ONLY_REASON =
  "This Pack is read-only, so its names, tags, Beats and thumbnails cannot be changed here.";
