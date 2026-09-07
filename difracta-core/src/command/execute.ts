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
      readonly label: string;
      readonly coalesceKey: string | undefined;
    }
  | { readonly ok: false; readonly error: string };

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
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    return {
      ok: false,
      error: `Invalid payload for “${name}”${where}: ${issue?.message ?? "invalid"}`,
    };
  }
  const payload = parsed.data;

  const outcome = definition.apply({ document, payload });
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
    label: definition.label?.(payload) ?? definition.name,
    coalesceKey: definition.coalesceKey?.(payload),
  };
}
