import type {
  Document,
  Macro,
  MacroAction,
  MacroKind,
  RunnableMacro,
  Table,
} from "./document.ts";
import type { Patch } from "./patch.ts";
import { childrenOf, descendantsOf, flattenTree } from "./tree.ts";

export const MACRO_LABELS: Record<MacroKind, string> = {
  macro: "Macro",
  group: "Group",
};

/** The Macros directly under the root (`parentId` null) or a Group, in order. */
export const childMacros = (
  macros: Table<Macro>,
  parentId: string | null,
): readonly Macro[] => childrenOf(macros, parentId);

/** Every Macro in navigator order: depth first from the root. */
export const flattenMacros = (macros: Table<Macro>): readonly Macro[] =>
  flattenTree(macros);

/** Every Macro below `macroId`, depth first in display order; empty unless it is a Group. */
export const descendantMacros = (
  macros: Table<Macro>,
  macroId: string,
): readonly Macro[] => descendantsOf(macros, macroId);

/** The Macros with actions, in navigator order. */
export function runnableMacros(macros: Table<Macro>): readonly RunnableMacro[] {
  return flattenTree(macros).filter(
    (macro): macro is RunnableMacro => macro.kind === "macro",
  );
}

/**
 * Patches dropping, from every Macro, the actions whose Address `keep`
 * rejects: what the removal of a Layer, Scene, Controller or Macro takes
 * with it. A Macro whose actions all stay is not touched.
 */
export function dropActions(
  document: Document,
  keep: (action: MacroAction) => boolean,
): Patch[] {
  const patches: Patch[] = [];
  for (const macro of Object.values(document.macros)) {
    if (macro.kind !== "macro") continue;
    const remaining = macro.actions.filter(keep);
    if (remaining.length !== macro.actions.length)
      patches.push({
        op: "set",
        path: ["macros", macro.id, "actions"],
        value: remaining,
      });
  }
  return patches;
}

/** Patches dropping every action on an Address under one of `prefixes` ("layer/<id>/"). */
export function dropActionsUnder(
  document: Document,
  prefixes: readonly string[],
): Patch[] {
  return dropActions(
    document,
    (action) => !prefixes.some((prefix) => action.address.startsWith(prefix)),
  );
}
