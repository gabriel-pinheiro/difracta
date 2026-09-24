import { sameName } from "@difracta/core";

interface OutputEntry {
  readonly id: string;
  readonly name: string;
}

/** What an `?output=` value picks among an Installation's Outputs. */
export type OutputChoice =
  | { readonly kind: "found"; readonly id: string }
  | { readonly kind: "unknown" }
  | { readonly kind: "ambiguous"; readonly matches: readonly OutputEntry[] };

/**
 * Resolves `?output=` the way the CLI resolves names: an Output id always
 * wins; otherwise the value must name exactly one Output, compared the way
 * the document keeps names unique (ignoring case and surrounding
 * whitespace). Several Outputs with that name are ambiguous, not a guess.
 */
export function chooseOutput(
  outputs: readonly OutputEntry[],
  query: string,
): OutputChoice {
  if (outputs.some((output) => output.id === query))
    return { kind: "found", id: query };
  const matches = outputs.filter((output) => sameName(output.name, query));
  const [only] = matches;
  if (only === undefined) return { kind: "unknown" };
  if (matches.length === 1) return { kind: "found", id: only.id };
  return { kind: "ambiguous", matches };
}
