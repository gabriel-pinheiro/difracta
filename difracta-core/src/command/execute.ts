import type { Document } from "../document/document.ts";
import { applyPatches, invertPatches, type Patch } from "../document/patch.ts";
import { validatePatchedDocument } from "../document/validate.ts";
import type { CommandDefinition } from "./command.ts";
import type { CommandRegistry } from "./registry.ts";

export type ExecutionResult =
  | {
      readonly ok: true;
      readonly definition: CommandDefinition<never>;
      readonly document: Document;
      readonly patches: readonly Patch[];
      readonly inverse: readonly Patch[];
      /** Trigger Addresses the command fired. */
      readonly events: readonly string[];
      readonly warnings: readonly string[];
      readonly label: string;
      readonly coalesceKey: string | undefined;
    }
  | {
      readonly ok: false;
      readonly error: string;
      /** One line per payload problem, `payload.<path>: <message>`; only for schema failures. */
      readonly issues?: readonly string[];
    };

/** Every problem the schema found, one line each, so a caller fixes them in one go. */
export function payloadIssues(error: {
  readonly issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[];
}): string[] {
  return error.issues.map((issue) => {
    const where = ["payload", ...issue.path.map(String)].join(".");
    return `${where}: ${issue.message}`;
  });
}

/**
 * Validates a raw payload against the command's schema, runs the pure apply,
 * validates the touched entities, and returns the next Document with forward
 * and inverse patches. Used by the runtime; usable by clients for optimistic
 * application because everything here is pure.
 */
export function executeCommand(
  registry: CommandRegistry,
  document: Document,
  name: string,
  rawPayload: unknown,
): ExecutionResult {
  const definition = registry.get(name);
  if (definition === undefined)
    return { ok: false, error: `Unknown command “${name}”.` };

  const parsed = definition.payload.safeParse(rawPayload);
  if (!parsed.success) {
    const issues = payloadIssues(parsed.error);
    return {
      ok: false,
      error: `Invalid payload for “${name}”: ${issues.join("; ")}`,
      issues,
    };
  }
  const payload = parsed.data;

  const outcome = definition.apply({
    document,
    payload,
    catalog: registry.catalog,
  });
  if (!outcome.ok) return outcome;

  const next = applyPatches(document, outcome.patches);
  const shapeError = validatePatchedDocument(next, outcome.patches);
  if (shapeError !== undefined) {
    return {
      ok: false,
      error: `“${name}” produced an invalid document: ${shapeError}`,
    };
  }

  return {
    ok: true,
    definition,
    document: next,
    patches: outcome.patches,
    inverse: invertPatches(document, outcome.patches),
    events: outcome.events ?? [],
    warnings: outcome.warnings ?? [],
    label:
      definition.label?.(payload, { document, catalog: registry.catalog }) ??
      definition.name,
    coalesceKey: definition.coalesceKey?.(payload),
  };
}
