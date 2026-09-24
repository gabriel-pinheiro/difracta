import { CommandError } from "@difracta/client";
import type { CommandResult } from "@difracta/protocol";

/** A created entity with the name it ended up with, which may differ from the one asked for. */
export interface NamedEntity {
  readonly table: string;
  readonly id: string;
  readonly name?: string;
}

/** A command's reply with its created entities named. */
export type NamedResult = Omit<CommandResult, "created"> & {
  readonly created?: readonly NamedEntity[] | undefined;
};

/**
 * How the CLI tells a person what a command did: the undo label, the ids
 * it created with their final names, the revision it produced, then one
 * line per warning (what a Macro run skipped, what a removal took with it).
 * `--json` prints the reply itself, so this is the human side only.
 */
export function formatCommandResult(
  result: NamedResult,
  fallback: string,
): string {
  if (!result.changed)
    return ["No change.", ...formatWarnings(result.warnings)].join("\n");
  const created = result.created
    ?.map((entity) =>
      entity.name === undefined ? entity.id : `${entity.id} “${entity.name}”`,
    )
    .join(", ");
  const head = `${result.label ?? fallback}${created === undefined ? "" : ` → ${created}`} (revision ${result.revision})`;
  return [head, ...formatWarnings(result.warnings)].join("\n");
}

/** Warnings as indented lines under the result they belong to. */
export function formatWarnings(
  warnings: readonly string[] | undefined,
): string[] {
  return (warnings ?? []).map((warning) => `  warning: ${warning}`);
}

/** What a failure becomes on stderr under `--json`: the message, and the payload issues when a schema refused it. */
export interface ErrorReport {
  readonly error: string;
  readonly issues?: readonly string[];
}

export function errorReport(error: unknown): ErrorReport {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof CommandError && error.issues.length > 0)
    return { error: message, issues: error.issues };
  return { error: message };
}
