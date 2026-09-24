import type { ZodType } from "zod";

import type { Catalog } from "../catalog/catalog.ts";
import type { Document } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/**
 * A Command is the only way a Document changes. One command lives in one file
 * with its payload schema, its `apply`, deterministic given its context, and
 * its test. The registry turns the same definition into the runtime handler
 * and the CLI subcommand.
 *
 * `authoring` commands enter undo history and mark the document dirty.
 * `performance` commands (Blackout, Controller moves, Cues) are live show
 * input: replicated, never undoable, never dirtying.
 */
export type CommandKind = "authoring" | "performance";

/** The count of a Macro run: actions the Run Mode picked, and of those the ones that passed their Chance. */
export interface MacroRun {
  readonly picked: number;
  readonly fired: number;
}

export interface CommandContext<TPayload> {
  readonly document: Document;
  readonly payload: TPayload;
  /** The Visuals and Filters this runtime knows, for commands that refer to them. */
  readonly catalog: Catalog;
  /** A number in [0, 1) each call, for a Macro run's picks and Chance rolls; seeded in tests. */
  readonly random: () => number;
}

export type CommandOutcome =
  | {
      readonly ok: true;
      readonly patches: readonly Patch[];
      /** Trigger Addresses fired: announced to every subscriber, never stored. */
      readonly events?: readonly string[];
      /** What a best-effort command could not do, one line each, for the caller to show. */
      readonly warnings?: readonly string[];
      /** How a Macro run went: how many actions its Run Mode picked and how many passed their Chance. */
      readonly run?: MacroRun;
    }
  | { readonly ok: false; readonly error: string };

export interface CommandDefinition<TPayload = unknown> {
  readonly name: string;
  readonly kind: CommandKind;
  readonly description: string;
  readonly payload: ZodType<TPayload>;
  /** Undo label, e.g. "Rename Output"; the document is the one before the command. */
  readonly label?: (
    payload: TPayload,
    context: Omit<CommandContext<TPayload>, "payload">,
  ) => string;
  /** Consecutive commands with the same key from one session merge into one undo step. */
  readonly coalesceKey?: (payload: TPayload) => string | undefined;
  apply(context: CommandContext<TPayload>): CommandOutcome;
}

export function defineCommand<TPayload>(
  definition: CommandDefinition<TPayload>,
): CommandDefinition<TPayload> {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/.test(definition.name)) {
    throw new Error(
      `Command name “${definition.name}” must look like “entity.verb”.`,
    );
  }
  return definition;
}

export function rejected(error: string): CommandOutcome {
  return { ok: false, error };
}

export function accepted(
  patches: readonly Patch[],
  events?: readonly string[],
  warnings?: readonly string[],
  run?: MacroRun,
): CommandOutcome {
  return {
    ok: true,
    patches,
    ...(events === undefined ? {} : { events }),
    ...(warnings === undefined ? {} : { warnings }),
    ...(run === undefined ? {} : { run }),
  };
}
