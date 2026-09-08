import { z, type ZodType } from "zod";

import {
  generateId,
  type Id,
  type InstallationId,
  type OutputId,
  type SurfaceId,
} from "../ids.ts";
import { QuadSchema } from "./geometry.ts";
import { DEFAULT_ORDER_KEY } from "./order.ts";

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
    /** Render at 1× device pixel ratio; eases the load on weak GPUs such as TVs. */
    limitPixelRatio: z.boolean().default(false),
    /** Position among Outputs; see `order.ts`. */
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Output = Entity<typeof OutputSchema, OutputId>;

/** How one Surface lands in one Output's Projection Frame. */
export const SurfaceMappingSchema = z
  .object({
    /** Where Surface Space's corners fall, in normalized Projection Frame coordinates. */
    corners: QuadSchema,
  })
  .strict();
export type SurfaceMapping = z.infer<typeof SurfaceMappingSchema>;

export const SurfaceSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    /** The Output this Surface renders through, or null while unassigned. */
    output: z.string().min(1).nullable(),
    /**
     * One mapping per Output the Surface was ever assigned to, keyed by Output
     * id. Only the entry for `output` is used; the others stay dormant so
     * assigning the Surface back to a projector restores its calibration.
     */
    mappings: z.record(z.string(), SurfaceMappingSchema),
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Surface = Entity<typeof SurfaceSchema, SurfaceId>;

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
    surfaces: z.record(z.string(), SurfaceSchema),
    operational: OperationalSchema,
  })
  .strict();

export interface Document {
  readonly installation: Installation;
  readonly outputs: Table<Output>;
  readonly surfaces: Table<Surface>;
  readonly operational: Operational;
}

/** Entity table schemas, keyed by the table's name in the Document. */
export const TABLE_SCHEMAS = {
  outputs: OutputSchema,
  surfaces: SurfaceSchema,
} as const;
export type TableName = keyof typeof TABLE_SCHEMAS;

/** Tables whose entities carry an `order` key and can be rearranged. */
export const ORDERED_TABLES = [
  "outputs",
  "surfaces",
] as const satisfies readonly TableName[];
export type OrderedTableName = (typeof ORDERED_TABLES)[number];

export const defaultOperational: Operational = { blackout: false };

export function emptyDocument(name: string): Document {
  return {
    installation: { id: generateId("installation"), name },
    outputs: {},
    surfaces: {},
    operational: defaultOperational,
  };
}

export function tableEntries<TEntity extends { readonly id: string }>(
  table: Table<TEntity>,
): readonly TEntity[] {
  return Object.values(table);
}
