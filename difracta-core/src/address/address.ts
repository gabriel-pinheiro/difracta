import type { Document } from "../document/document.ts";
import type { PatchPath } from "../document/patch.ts";

/**
 * An Address names one controllable property or trigger in a Document, such
 * as `installation/blackout` or `layer/<id>/opacity`. Controllers,
 * Macros, Pads, OSC and the CLI all read and write Addresses, so adding an
 * entry here makes a property reachable from every control surface at once.
 */
export type AddressValueType = "boolean" | "number" | "trigger";

export interface ResolvedAddress {
  readonly address: string;
  readonly label: string;
  readonly path: PatchPath;
  readonly type: AddressValueType;
}

interface AddressPattern {
  /** Segments; `*` captures one id. */
  readonly pattern: readonly string[];
  readonly type: AddressValueType;
  resolve(
    document: Document,
    captures: readonly string[],
  ): Omit<ResolvedAddress, "address" | "type"> | undefined;
  list(document: Document): readonly (readonly string[])[];
}

const patterns: readonly AddressPattern[] = [
  {
    pattern: ["installation", "blackout"],
    type: "boolean",
    resolve: () => ({ label: "Blackout", path: ["operational", "blackout"] }),
    list: () => [[]],
  },
];

export function formatAddress(segments: readonly string[]): string {
  return segments.join("/");
}

export function resolveAddress(
  document: Document,
  address: string,
): ResolvedAddress | undefined {
  const segments = address.split("/");
  for (const candidate of patterns) {
    if (candidate.pattern.length !== segments.length) continue;
    const captures: string[] = [];
    let matched = true;
    for (const [index, expected] of candidate.pattern.entries()) {
      const actual = segments[index] ?? "";
      if (expected === "*") captures.push(actual);
      else if (expected !== actual) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const resolved = candidate.resolve(document, captures);
    return resolved === undefined
      ? undefined
      : { ...resolved, address, type: candidate.type };
  }
  return undefined;
}

/** Every Address currently reachable in the Document, for OSCQuery and the CLI. */
export function listAddresses(document: Document): readonly ResolvedAddress[] {
  const result: ResolvedAddress[] = [];
  for (const candidate of patterns) {
    for (const captures of candidate.list(document)) {
      let captureIndex = 0;
      const segments = candidate.pattern.map((segment) =>
        segment === "*" ? (captures[captureIndex++] ?? "") : segment,
      );
      const address = formatAddress(segments);
      const resolved = resolveAddress(document, address);
      if (resolved !== undefined) result.push(resolved);
    }
  }
  return result;
}

export function isValidAddressValue(
  type: AddressValueType,
  value: unknown,
): boolean {
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "trigger":
      return value === undefined || value === null;
  }
}
