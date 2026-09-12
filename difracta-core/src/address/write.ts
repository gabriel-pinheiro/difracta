import type { Catalog } from "../catalog/catalog.ts";
import type { Document } from "../document/document.ts";
import { getAtPath, type Patch } from "../document/patch.ts";
import {
  addressValueProblem,
  resolveAddress,
  sameAddressValue,
  type ResolvedAddress,
} from "./address.ts";
import { linkAt } from "./links.ts";

export type Written =
  | {
      readonly ok: true;
      readonly patches: readonly Patch[];
      readonly resolved: ResolvedAddress;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Writing a value to an Address, the one rule behind `address.set`,
 * `address.edit` and a Macro's set action: the Address must exist, be
 * settable, not be driven by a Controller, and accept the value. Writing
 * what is already there changes nothing.
 */
export function writeAddress(
  document: Document,
  catalog: Catalog,
  address: string,
  value: unknown,
): Written {
  const resolved = resolveAddress(document, address, catalog);
  if (resolved === undefined)
    return { ok: false, error: `Unknown address “${address}”.` };
  if (resolved.type === "trigger")
    return {
      ok: false,
      error: `Address “${address}” is a trigger; use address.trigger.`,
    };
  const link = linkAt(document, address);
  if (link !== undefined)
    return {
      ok: false,
      error: `${resolved.label} is controlled by ${document.controllers[link.controllerId]?.name ?? "a Controller"}.`,
    };
  const problem = addressValueProblem(resolved, value);
  if (problem !== undefined)
    return { ok: false, error: `${resolved.label} ${problem}.` };
  if (sameAddressValue(getAtPath(document, resolved.path), value))
    return { ok: true, patches: [], resolved };
  return {
    ok: true,
    patches: [{ op: "set", path: resolved.path, value }],
    resolved,
  };
}

/** Flipping a boolean Address: the same rule as a write of its opposite. */
export function toggleAddress(
  document: Document,
  catalog: Catalog,
  address: string,
): Written {
  const resolved = resolveAddress(document, address, catalog);
  if (resolved === undefined)
    return { ok: false, error: `Unknown address “${address}”.` };
  if (resolved.type !== "boolean")
    return { ok: false, error: `Address “${address}” is not a boolean.` };
  const current = getAtPath(document, resolved.path) === true;
  return writeAddress(document, catalog, address, !current);
}
