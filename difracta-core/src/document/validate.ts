import {
  InstallationSchema,
  OperationalSchema,
  TABLE_SCHEMAS,
  type Document,
  type TableName,
} from "./document.ts";
import { getAtPath, type Patch } from "./patch.ts";

/**
 * Validates only what a patch list touched. A patch under a table validates
 * that one entity; a patch under `installation` or `operational` validates
 * that object. Commands are trusted for invariants across entities (unique
 * names, references); this catches shape mistakes without re-parsing the
 * whole Document on every change.
 */
export function validatePatchedDocument(
  document: Document,
  patches: readonly Patch[],
): string | undefined {
  const checked = new Set<string>();
  for (const patch of patches) {
    const [root, entityId] = patch.path;
    if (root === undefined) return "A patch path must not be empty.";

    if (root === "installation") {
      const error = check(
        InstallationSchema,
        document.installation,
        checked,
        root,
      );
      if (error !== undefined) return error;
      continue;
    }
    if (root === "operational") {
      const error = check(
        OperationalSchema,
        document.operational,
        checked,
        root,
      );
      if (error !== undefined) return error;
      continue;
    }
    if (!(root in TABLE_SCHEMAS)) return `Unknown document table “${root}”.`;
    if (entityId === undefined)
      return `Patches must target one entity in “${root}”.`;

    const entity = getAtPath(document, [root, entityId]);
    if (entity === undefined) continue; // removed
    const error = check(
      TABLE_SCHEMAS[root as TableName],
      entity,
      checked,
      `${root}/${entityId}`,
    );
    if (error !== undefined) return error;
  }
  return undefined;
}

function check(
  schema: {
    safeParse(value: unknown): {
      success: boolean;
      error?: { issues: { message: string }[] };
    };
  },
  value: unknown,
  checked: Set<string>,
  key: string,
): string | undefined {
  if (checked.has(key)) return undefined;
  checked.add(key);
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  return `${key}: ${result.error?.issues[0]?.message ?? "invalid"}`;
}
