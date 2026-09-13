import { CommandError } from "@difracta/client";
import type { CommandResult } from "@difracta/protocol";

/**
 * How the CLI tells a person what a command did: the undo label, the ids
 * it created, the revision it produced, then one line per warning (what a
 * Macro run skipped, what a removal took with it). `--json` prints the
 * reply itself, so this is the human side only.
 */
export function formatCommandResult(
  result: CommandResult,
  fallback: string,
): string {
  if (!result.changed)
    return ["No change.", ...formatWarnings(result.warnings)].join("\n");
  const created = result.created?.map((entity) => entity.id).join(", ");
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
