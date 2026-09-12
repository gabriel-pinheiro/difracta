import type { Catalog } from "../catalog/catalog.ts";
import type { Document, MacroAction } from "../document/document.ts";
import { applyPatches, type Patch } from "../document/patch.ts";
import { addressValueProblem, resolveAddress } from "./address.ts";
import { linkAt } from "./links.ts";
import { toggleAddress, writeAddress } from "./write.ts";

/** What firing a trigger Address did: patches to commit, events to announce, actions that could not run. */
export interface Fired {
  readonly patches: readonly Patch[];
  readonly events: readonly string[];
  /** One line per skipped Macro action: which Macro, which action, why. */
  readonly warnings: readonly string[];
}

export type FireOutcome =
  | ({ readonly ok: true } & Fired)
  | { readonly ok: false; readonly error: string };

/**
 * Firing a trigger Address. A Layer's Cue is an event for the Outputs; a
 * Scene's play cuts the Outputs to it; a Macro's run performs its actions
 * in order, each against the document as the previous ones left it, and
 * best-effort: an action that cannot run (its target gone, its Address
 * driven by a Controller) is skipped with a warning and the rest go on.
 * Every Macro runs at most once per firing, so Macros may run Macros
 * without a loop.
 */
export function fireAddress(
  document: Document,
  catalog: Catalog,
  address: string,
): FireOutcome {
  const resolved = resolveAddress(document, address, catalog);
  if (resolved === undefined)
    return { ok: false, error: `Unknown address “${address}”.` };
  if (resolved.type !== "trigger")
    return { ok: false, error: `Address “${address}” is not a trigger.` };
  return { ok: true, ...fireResolved(document, catalog, address, new Set()) };
}

function fireResolved(
  document: Document,
  catalog: Catalog,
  address: string,
  ran: Set<string>,
): Fired {
  const [kind, id = ""] = address.split("/");
  if (kind === "scene")
    return {
      patches:
        document.installation.activeScene === id
          ? []
          : [{ op: "set", path: ["installation", "activeScene"], value: id }],
      events: [],
      warnings: [],
    };
  if (kind === "macro") return runMacro(document, catalog, id, ran);
  return { patches: [], events: [address], warnings: [] };
}

function runMacro(
  document: Document,
  catalog: Catalog,
  macroId: string,
  ran: Set<string>,
): Fired {
  const macro = document.macros[macroId];
  if (macro?.kind !== "macro") return { patches: [], events: [], warnings: [] };
  if (ran.has(macroId))
    return {
      patches: [],
      events: [],
      warnings: [`${macro.name}: already ran during this run.`],
    };
  ran.add(macroId);
  const patches: Patch[] = [];
  const events: string[] = [];
  const warnings: string[] = [];
  let working = document;
  for (const action of macro.actions) {
    const outcome = performAction(working, catalog, action, ran);
    if (typeof outcome === "string") {
      warnings.push(`${macro.name}: ${outcome}`);
      continue;
    }
    patches.push(...outcome.patches);
    events.push(...outcome.events);
    warnings.push(...outcome.warnings);
    working = applyPatches(working, outcome.patches);
  }
  return { patches, events, warnings };
}

/** One action against `document`; a string says why it could not run. */
function performAction(
  document: Document,
  catalog: Catalog,
  action: MacroAction,
  ran: Set<string>,
): Fired | string {
  const resolved = resolveAddress(document, action.address, catalog);
  if (resolved === undefined) return `${action.address} no longer exists.`;
  const name = `${resolved.owner ?? ""} ${resolved.label}`.trim();
  switch (action.kind) {
    case "set": {
      const written = writeAddress(
        document,
        catalog,
        action.address,
        action.value,
      );
      return written.ok
        ? { patches: written.patches, events: [], warnings: [] }
        : written.error;
    }
    case "toggle": {
      const written = toggleAddress(document, catalog, action.address);
      return written.ok
        ? { patches: written.patches, events: [], warnings: [] }
        : written.error;
    }
    case "trigger":
      if (resolved.type !== "trigger") return `${name} is not a trigger.`;
      return fireResolved(document, catalog, action.address, ran);
  }
}

/**
 * Why an action would be skipped if its Macro ran now, for the inspector
 * to show before the show; undefined when it would run. A Macro running
 * itself is not a problem: the guard skips the second run.
 */
export function actionProblem(
  document: Document,
  catalog: Catalog,
  action: MacroAction,
): string | undefined {
  const resolved = resolveAddress(document, action.address, catalog);
  if (resolved === undefined) return "The target no longer exists.";
  switch (action.kind) {
    case "set": {
      if (resolved.type === "trigger") return `${resolved.label} is a trigger.`;
      const problem = addressValueProblem(resolved, action.value);
      if (problem !== undefined) return `The value ${problem}.`;
      break;
    }
    case "toggle":
      if (resolved.type !== "boolean")
        return `${resolved.label} is not a switch.`;
      break;
    case "trigger":
      if (resolved.type !== "trigger")
        return `${resolved.label} is not a trigger.`;
      return undefined;
  }
  const link = linkAt(document, action.address);
  if (link !== undefined)
    return `${resolved.label} is controlled by ${document.controllers[link.controllerId]?.name ?? "a Controller"}.`;
  return undefined;
}
