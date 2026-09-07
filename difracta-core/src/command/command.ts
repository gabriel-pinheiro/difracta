import type { ZodType } from "zod";

import type { Document } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/**
 * A Command is the only way a Document changes. One command lives in one file
 * with its payload schema, its pure `apply`, and its test. The registry turns
 * the same definition into the runtime handler and the CLI subcommand.
 *
 * `authoring` commands enter undo history and mark the document dirty.
 * `performance` commands (Blackout, Controller moves, Cues) are live show
 * input: replicated, never undoable, never dirtying.
 */
export type CommandKind = "authoring" | "performance";

export interface CommandContext<TPayload> {
  readonly document: Document;
  readonly payload: TPayload;
}

export type CommandOutcome =
  | { readonly ok: true; readonly patches: readonly Patch[] }
  | { readonly ok: false; readonly error: string };

export interface CommandDefinition<TPayload = unknown> {
  readonly name: string;
  readonly kind: CommandKind;
  readonly description: string;
  readonly payload: ZodType<TPayload>;
  /** Undo label, e.g. "Rename Output". */
  readonly label?: (payload: TPayload) => string;
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

export function accepted(patches: readonly Patch[]): CommandOutcome {
  return { ok: true, patches };
}
