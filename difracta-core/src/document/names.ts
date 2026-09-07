/**
 * Entity names are unique within a table, compared ignoring case and
 * surrounding whitespace ("Café" and "Cafe" stay distinct). Rather than
 * rejecting a taken name, creation and rename pick the
 * next free numbered variant: with "Foo" taken, "Foo" becomes "Foo 1"; with
 * "Foo" and "Foo 1" taken, asking for either yields "Foo 2".
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
  const base = NUMBERED_SUFFIX.exec(wanted)?.[1] ?? wanted;
  for (let index = 1; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!isTaken(candidate)) return candidate;
  }
}
