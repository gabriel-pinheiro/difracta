import type { Catalog } from "../catalog/catalog.ts";
import type { MacroRun } from "../command/command.ts";
import type {
  Document,
  MacroAction,
  RunnableMacro,
} from "../document/document.ts";
import { applyPatches, type Patch } from "../document/patch.ts";
import { addressValueProblem, resolveAddress } from "./address.ts";
import { linkAt } from "./links.ts";
import { unknownAddress } from "./unknown.ts";
import { toggleAddress, writeAddress } from "./write.ts";

/** What firing a trigger Address did: patches to commit, events to announce, actions that could not run. */
export interface Fired {
  readonly patches: readonly Patch[];
  readonly events: readonly string[];
  /** One line per skipped Macro action: which Macro, which action, why. */
  readonly warnings: readonly string[];
  /** The count of the Macro run, when the Address was a Macro's run. */
  readonly run?: MacroRun;
}

export type FireOutcome =
  | ({ readonly ok: true } & Fired)
  | { readonly ok: false; readonly error: string };

const NOTHING: Fired = { patches: [], events: [], warnings: [] };

/**
 * Firing a trigger Address. A Layer's Cue is an event for the Outputs; a
 * Scene's play cuts the Outputs to it; a Macro's run performs the actions
 * its Run Mode picks, in list order, each against the document as the
 * previous ones left it, and best-effort: an action that cannot run (its
 * target gone, its Address driven by a Controller) is skipped with a
 * warning and the rest go on. `random` decides the picks and the Chance
 * rolls. Every Macro runs at most once per firing, so Macros may run
 * Macros without a loop.
 */
export function fireAddress(
  document: Document,
  catalog: Catalog,
  address: string,
  random: () => number,
): FireOutcome {
  const resolved = resolveAddress(document, address, catalog);
  if (resolved === undefined)
    return { ok: false, error: unknownAddress(document, address, catalog) };
  if (resolved.type !== "trigger")
    return { ok: false, error: `Address “${address}” is not a trigger.` };
  const firing: Firing = { catalog, random, ran: new Set() };
  return { ok: true, ...fireResolved(document, address, firing) };
}

/** What one firing carries down through the Macros it runs. */
interface Firing {
  readonly catalog: Catalog;
  readonly random: () => number;
  /** Macros that ran during this firing, so none runs twice. */
  readonly ran: Set<string>;
}

function fireResolved(
  document: Document,
  address: string,
  firing: Firing,
): Fired {
  const [kind, id = ""] = address.split("/");
  if (kind === "scene")
    return {
      ...NOTHING,
      patches:
        document.installation.activeScene === id
          ? []
          : [{ op: "set", path: ["installation", "activeScene"], value: id }],
    };
  if (kind === "macro") return runMacro(document, id, firing);
  return { ...NOTHING, events: [address] };
}

function runMacro(document: Document, macroId: string, firing: Firing): Fired {
  const macro = document.macros[macroId];
  if (macro?.kind !== "macro") return NOTHING;
  if (firing.ran.has(macroId))
    return {
      ...NOTHING,
      warnings: [`${macro.name}: already ran during this run.`],
    };
  firing.ran.add(macroId);
  const picked = pickActions(document, macro, firing.random);
  const patches: Patch[] = [...picked.patches];
  const events: string[] = [];
  const warnings: string[] = [];
  let fired = 0;
  let working = applyPatches(document, picked.patches);
  for (const index of picked.indices) {
    const action = macro.actions[index];
    if (action === undefined) continue;
    if (action.chance !== undefined && firing.random() >= action.chance)
      continue;
    fired += 1;
    const outcome = performAction(working, action, firing);
    if (typeof outcome === "string") {
      warnings.push(`${macro.name}: ${outcome}`);
      continue;
    }
    patches.push(...outcome.patches);
    events.push(...outcome.events);
    warnings.push(...outcome.warnings);
    working = applyPatches(working, outcome.patches);
  }
  return {
    patches,
    events,
    warnings,
    run: { picked: picked.indices.length, fired },
  };
}

/**
 * The indices of the actions a run performs, ascending so they run in list
 * order whatever the mode drew, and the patches the mode itself makes: a
 * Sequence moves its position on. The position is read modulo the action
 * count, so a list edited since still lands on an action.
 */
function pickActions(
  document: Document,
  macro: RunnableMacro,
  random: () => number,
): { readonly indices: readonly number[]; readonly patches: readonly Patch[] } {
  const total = macro.actions.length;
  if (total === 0) return { indices: [], patches: [] };
  switch (macro.mode) {
    case "all":
      return { indices: macro.actions.map((_, index) => index), patches: [] };
    case "one":
      return { indices: [Math.floor(random() * total)], patches: [] };
    case "some":
      return { indices: sample(total, macro.count, random), patches: [] };
    case "sequence": {
      const index = (document.operational.sequence[macro.id] ?? 0) % total;
      return {
        indices: [index],
        patches: [
          {
            op: "set",
            path: ["operational", "sequence", macro.id],
            value: (index + 1) % total,
          },
        ],
      };
    }
  }
}

/** `count` distinct indices below `total` drawn at random, ascending; all of them when `count` is not smaller. */
function sample(
  total: number,
  count: number,
  random: () => number,
): readonly number[] {
  const indices = Array.from({ length: total }, (_, index) => index);
  const drawn = Math.min(count, total);
  for (let at = 0; at < drawn; at += 1) {
    const swap = at + Math.floor(random() * (total - at));
    [indices[at], indices[swap]] = [indices[swap] ?? 0, indices[at] ?? 0];
  }
  return indices.slice(0, drawn).sort((a, b) => a - b);
}

/** One action against `document`; a string says why it could not run. */
function performAction(
  document: Document,
  action: MacroAction,
  firing: Firing,
): Fired | string {
  const { catalog } = firing;
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
        ? { ...NOTHING, patches: written.patches }
        : written.error;
    }
    case "toggle": {
      const written = toggleAddress(document, catalog, action.address);
      return written.ok
        ? { ...NOTHING, patches: written.patches }
        : written.error;
    }
    case "trigger":
      if (resolved.type !== "trigger") return `${name} is not a trigger.`;
      return fireResolved(document, action.address, firing);
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
