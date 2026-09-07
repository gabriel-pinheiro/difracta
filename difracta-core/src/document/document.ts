import { z, type ZodType } from "zod";

import {
  generateId,
  type Id,
  type InstallationId,
  type OutputId,
} from "../ids.ts";

/**
 * A Document is one Installation as normalized entity tables. Every table is
 * keyed by entity id; order, where it matters, is an explicit field on the
 * entity. Patches address any value by path (`["outputs", id, "name"]`), so
 * deltas on the wire are per property, never per Installation.
 *
 * `operational` holds live state (Blackout) that is replicated like everything
 * else but never written to the file.
 */

const EntityName = z.string().trim().min(1).max(120);

/**
 * The TypeScript type of an entity: its Zod schema's output with the `id`
 * narrowed to the entity's branded id. Schemas keep `id` as a plain string
 * because ids arrive from files and the wire as text.
 */
export type Entity<TSchema extends ZodType, TId extends Id<string>> = Omit<
  z.infer<TSchema>,
  "id"
> & { readonly id: TId };

export const InstallationSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
  })
  .strict();
export type Installation = Entity<typeof InstallationSchema, InstallationId>;

export const OutputSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
  })
  .strict();
export type Output = Entity<typeof OutputSchema, OutputId>;

export const OperationalSchema = z
  .object({
    blackout: z.boolean(),
  })
  .strict();
export type Operational = z.infer<typeof OperationalSchema>;

export type Table<TEntity extends { readonly id: string }> = Readonly<
  Record<string, TEntity>
>;

export const DocumentSchema = z
  .object({
    installation: InstallationSchema,
    outputs: z.record(z.string(), OutputSchema),
    operational: OperationalSchema,
  })
  .strict();

export interface Document {
  readonly installation: Installation;
  readonly outputs: Table<Output>;
  readonly operational: Operational;
}

/** Entity table schemas, keyed by the table's name in the Document. */
export const TABLE_SCHEMAS = {
  outputs: OutputSchema,
} as const;
export type TableName = keyof typeof TABLE_SCHEMAS;

export const defaultOperational: Operational = { blackout: false };

export function emptyDocument(name: string): Document {
  return {
    installation: { id: generateId("installation"), name },
    outputs: {},
    operational: defaultOperational,
  };
}

export function tableEntries<TEntity extends { readonly id: string }>(
  table: Table<TEntity>,
): readonly TEntity[] {
  return Object.values(table);
}
