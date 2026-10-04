import { resolveAddress, type AddressSource } from "../address/address.ts";
import type { Catalog } from "../catalog/catalog.ts";
import { layerDefinition } from "../address/address.ts";
import type { Document } from "./document.ts";
import type { MediaType } from "./media.ts";
import { orderedEntries } from "./order.ts";
import type { Patch } from "./patch.ts";
import { flattenTree } from "./tree.ts";

/**
 * One place a Media reference is held: a Layer's `media` Parameter, or a
 * Macro's set action on such a Parameter's Address.
 */
export type MediaUse =
  | {
      readonly kind: "layer";
      readonly reference: string;
      readonly accepts: MediaType;
      readonly layerId: string;
      readonly parameter: string;
      /** The Parameter's label, "Image" or "Video". */
      readonly label: string;
    }
  | {
      readonly kind: "macro";
      readonly reference: string;
      readonly accepts: MediaType;
      readonly macroId: string;
      /** The index of the action in the Macro's list. */
      readonly action: number;
    };

/**
 * Every Media reference the document holds and where: the `media`
 * Parameter values of every Visual and Filter Layer whose definition the
 * Catalog knows (only the definition says which Parameter is a media one),
 * in navigator order, then the set actions of every Macro whose Address
 * resolves to a media one. Empty values are left out. The render loader
 * preloads what it names, `media.replace` rewrites it and Studio counts it
 * before a Pack is detached.
 */
export function mediaReferencesInUse(
  document: AddressSource,
  catalog: Catalog,
): readonly MediaUse[] {
  const uses: MediaUse[] = [];
  for (const layer of orderedEntries(document.layers)) {
    if (layer.kind === "group") continue;
    const definition = layerDefinition(layer, catalog);
    if (definition === undefined) continue;
    for (const [name, parameter] of Object.entries(definition.parameters)) {
      if (parameter.kind !== "media") continue;
      const value = layer.parameters[name];
      if (typeof value !== "string" || value === "") continue;
      uses.push({
        kind: "layer",
        reference: value,
        accepts: parameter.accepts,
        layerId: layer.id,
        parameter: name,
        label: parameter.label,
      });
    }
  }
  for (const macro of flattenTree(document.macros)) {
    if (macro.kind !== "macro") continue;
    macro.actions.forEach((action, index) => {
      if (action.kind !== "set") return;
      if (typeof action.value !== "string" || action.value === "") return;
      const resolved = resolveAddress(document, action.address, catalog);
      if (resolved?.type !== "media") return;
      uses.push({
        kind: "macro",
        reference: action.value,
        accepts: resolved.accepts ?? "image",
        macroId: macro.id,
        action: index,
      });
    });
  }
  return uses;
}

/** The uses holding exactly `reference`. */
export function usesOf(
  document: AddressSource,
  catalog: Catalog,
  reference: string,
): readonly MediaUse[] {
  return mediaReferencesInUse(document, catalog).filter(
    (use) => use.reference === reference,
  );
}

/** The uses whose reference `matches`: the entries of one Pack, for instance. */
export function usesMatching(
  document: AddressSource,
  catalog: Catalog,
  matches: (reference: string) => boolean,
): readonly MediaUse[] {
  return mediaReferencesInUse(document, catalog).filter((use) =>
    matches(use.reference),
  );
}

/**
 * Patches writing `to` wherever `uses` hold a reference: one per Layer
 * Parameter, and one per Macro whose action list changes, with every
 * affected action rewritten.
 */
export function rewriteUses(
  document: Pick<Document, "macros">,
  uses: readonly MediaUse[],
  to: string,
): Patch[] {
  const patches: Patch[] = [];
  const byMacro = new Map<string, Set<number>>();
  for (const use of uses) {
    if (use.kind === "layer")
      patches.push({
        op: "set",
        path: ["layers", use.layerId, "parameters", use.parameter],
        value: to,
      });
    else {
      const indices = byMacro.get(use.macroId) ?? new Set<number>();
      indices.add(use.action);
      byMacro.set(use.macroId, indices);
    }
  }
  for (const [macroId, indices] of byMacro) {
    const macro = document.macros[macroId];
    if (macro?.kind !== "macro") continue;
    patches.push({
      op: "set",
      path: ["macros", macroId, "actions"],
      value: macro.actions.map((action, index) =>
        indices.has(index) && action.kind === "set"
          ? { ...action, value: to }
          : action,
      ),
    });
  }
  return patches;
}
