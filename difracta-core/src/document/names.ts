/**
 * Entity names are unique within a table, compared ignoring case and
 * surrounding whitespace ("Café" and "Cafe" stay distinct). Rather than
 * rejecting a taken name, creation and rename pick the
 * next free numbered variant: with "Foo" taken, "Foo" becomes "Foo 1"; with
 * "Foo" and "Foo 1" taken, asking for either yields "Foo 2". A trailing
 * number is only read as such a counter when the name without it, or another
 * numbered variant of it, is taken too: a second "Atomic 3000" becomes
 * "Atomic 3000 1", not "Atomic 1".
 */
export function sameName(first: string, second: string): boolean {
  return (
    first.trim().localeCompare(second.trim(), undefined, {
      sensitivity: "accent",
    }) === 0
  );
}

const NUMBERED_SUFFIX = /^(.*\S)\s+(\d+)$/;

/**
 * The name to use for `requested` given the names already `taken`. When
 * renaming, leave the entity's own current name out of `taken`.
 */
export function uniqueName(taken: Iterable<string>, requested: string): string {
  const existing = [...taken];
  const isTaken = (candidate: string): boolean =>
    existing.some((name) => sameName(name, candidate));
  const wanted = requested.trim();
  if (!isTaken(wanted)) return wanted;
  const base = counterBase(existing, wanted);
  for (let index = 1; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!isTaken(candidate)) return candidate;
  }
}

/**
 * What to number from: `wanted` without its trailing number when that number
 * is a counter of a taken name, else `wanted` itself.
 */
function counterBase(taken: readonly string[], wanted: string): string {
  const base = NUMBERED_SUFFIX.exec(wanted)?.[1];
  if (base === undefined) return wanted;
  const isVariant = (name: string): boolean =>
    !sameName(name, wanted) &&
    (sameName(name, base) ||
      sameName(NUMBERED_SUFFIX.exec(name.trim())?.[1] ?? "", base));
  return taken.some(isVariant) ? base : wanted;
}

/**
 * Whether `name` is `base` or a numbered variant of it ("Flash Cut 2"),
 * ignoring case: an entity still called after what it was made from, whose
 * name may follow what it is made from next.
 */
export function namedAfter(name: string, base: string): boolean {
  const escaped = base.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}( \\d+)?$`, "i").test(name.trim());
}
