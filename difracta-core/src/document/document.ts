import { z, type ZodType } from "zod";

import {
  generateId,
  type Id,
  type InstallationId,
  type LayerId,
  type MaskId,
  type SceneId,
  type OutputId,
  type SurfaceId,
} from "../ids.ts";
import { CornerNameSchema, PointSchema, QuadSchema } from "./geometry.ts";
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
export type Entity<TSchema extends ZodType, TId extends Id<string>> = Branded<
  z.infer<TSchema>,
  TId
>;
/** Distributes over unions, so a discriminated entity keeps its variants. */
type Branded<TValue, TId> = TValue extends unknown
  ? Omit<TValue, "id"> & { readonly id: TId }
  : never;

export const InstallationSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    /** The Scene the Outputs render; saved, so a show reopens where it left off. */
    activeScene: z.string().min(1).nullable().default(null),
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

export const MASK_POINTS = { min: 3, max: 16 } as const;

/**
 * A polygon in Surface Space deciding which part of its Surface is lit. A
 * Surface with no include Masks is fully lit; with any, it starts closed.
 * Masks then apply in order, each opening (include) or closing (exclude)
 * only its own polygon. Feather fades inward only, as a fraction of Surface
 * Space, so it never spills past the physical edge the Mask respects.
 */
export const MaskSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    surfaceId: z.string().min(1),
    mode: z.enum(["include", "exclude"]),
    points: z
      .array(PointSchema)
      .min(MASK_POINTS.min)
      .max(MASK_POINTS.max)
      .readonly(),
    feather: z.number().min(0).max(1),
    /** Position among the Masks of the same Surface. */
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Mask = Entity<typeof MaskSchema, MaskId>;
export type MaskMode = Mask["mode"];

export const CALIBRATION_VIEWS = ["selected", "outlines", "patterns"] as const;
export const CalibrationViewSchema = z.enum(CALIBRATION_VIEWS);
export type CalibrationView = z.infer<typeof CalibrationViewSchema>;

/**
 * Calibration Mode: one Surface (or one of its Masks) shown as a pattern on
 * its Output instead of the dim fill. `owner` is the live session that
 * entered it, so the runtime can clear it when that session goes away.
 */
export const CalibrationSchema = z
  .object({
    surfaceId: z.string().min(1),
    /** Mask being aligned, with its Masks applied; null aligns the quad. */
    maskId: z.string().min(1).nullable(),
    /** Corner or Mask point highlighted on the Output. */
    corner: CornerNameSchema.nullable(),
    point: z.number().int().min(0).nullable(),
    /** What the other Surfaces of the Output show meanwhile. */
    view: CalibrationViewSchema,
    owner: z.string().min(1),
  })
  .strict();
export type Calibration = z.infer<typeof CalibrationSchema>;

export const SceneSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Scene = Entity<typeof SceneSchema, SceneId>;

/** Fields every Layer has, whatever its kind. */
const LayerBase = {
  id: z.string().min(1),
  name: EntityName,
  sceneId: z.string().min(1),
  /** The Group containing the Layer, or null at the Scene's root. */
  parentId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  /** Position among the Layers of the same parent; first is topmost. */
  order: z.string().min(1).default(DEFAULT_ORDER_KEY),
};

export const BLEND_MODES = ["normal", "additive"] as const;
export const BlendModeSchema = z.enum(BLEND_MODES);
export type BlendMode = z.infer<typeof BlendModeSchema>;

export const LAYER_KINDS = ["visual", "filter", "group"] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

/**
 * Everything in a Scene's stack is a Layer: a Visual Layer renders one
 * Visual on a Target, a Filter Layer transforms everything below it, a
 * Group contains Layers. One table, one ordering, one move.
 */
export const LayerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...LayerBase,
      kind: z.literal("visual"),
      /** Visual definition id; null until one is picked. */
      visual: z.string().min(1).nullable(),
      /** Surface the Layer renders into; null renders nowhere. */
      target: z.string().min(1).nullable(),
      opacity: z.number().min(0).max(1),
      blendMode: BlendModeSchema,
    })
    .strict(),
  z
    .object({
      ...LayerBase,
      kind: z.literal("filter"),
      /** Filter definition id; null until one is picked. */
      filter: z.string().min(1).nullable(),
      /** How much of the Filter's result replaces its input. */
      mix: z.number().min(0).max(1),
    })
    .strict(),
  z.object({ ...LayerBase, kind: z.literal("group") }).strict(),
]);
export type Layer = Entity<typeof LayerSchema, LayerId>;
export type VisualLayer = Extract<Layer, { kind: "visual" }>;
export type FilterLayer = Extract<Layer, { kind: "filter" }>;
export type GroupLayer = Extract<Layer, { kind: "group" }>;

export const OperationalSchema = z
  .object({
    blackout: z.boolean(),
    calibration: CalibrationSchema.nullable(),
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
    masks: z.record(z.string(), MaskSchema),
    scenes: z.record(z.string(), SceneSchema),
    layers: z.record(z.string(), LayerSchema),
    operational: OperationalSchema,
  })
  .strict();

export interface Document {
  readonly installation: Installation;
  readonly outputs: Table<Output>;
  readonly surfaces: Table<Surface>;
  readonly masks: Table<Mask>;
  readonly scenes: Table<Scene>;
  readonly layers: Table<Layer>;
  readonly operational: Operational;
}

/** Entity table schemas, keyed by the table's name in the Document. */
export const TABLE_SCHEMAS = {
  outputs: OutputSchema,
  surfaces: SurfaceSchema,
  masks: MaskSchema,
  scenes: SceneSchema,
  layers: LayerSchema,
} as const;
export type TableName = keyof typeof TABLE_SCHEMAS;

/** Tables whose entities carry an `order` key and can be rearranged. */
export const ORDERED_TABLES = [
  "outputs",
  "surfaces",
  "masks",
  "scenes",
  "layers",
] as const satisfies readonly TableName[];
export type OrderedTableName = (typeof ORDERED_TABLES)[number];

/**
 * Ordered tables whose entities are children: siblings share the values of
 * these fields, and order keys and names are unique only among siblings.
 */
export const PARENT_FIELDS: Partial<
  Record<OrderedTableName, readonly string[]>
> = {
  masks: ["surfaceId"],
  layers: ["sceneId", "parentId"],
};

/** The entities of `table` that share `entity`'s parent, `entity` included. */
export function siblingsOf<TEntity extends { readonly id: string }>(
  tableName: OrderedTableName,
  table: Table<TEntity>,
  entity: TEntity,
): Table<TEntity> {
  const fields = PARENT_FIELDS[tableName];
  if (fields === undefined) return table;
  const record = entity as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(table).filter(([, candidate]) =>
      fields.every(
        (field) =>
          (candidate as Record<string, unknown>)[field] === record[field],
      ),
    ),
  );
}

export const defaultOperational: Operational = {
  blackout: false,
  calibration: null,
};

export function emptyDocument(name: string): Document {
  return {
    installation: { id: generateId("installation"), name, activeScene: null },
    outputs: {},
    surfaces: {},
    masks: {},
    scenes: {},
    layers: {},
    operational: defaultOperational,
  };
}

export function tableEntries<TEntity extends { readonly id: string }>(
  table: Table<TEntity>,
): readonly TEntity[] {
  return Object.values(table);
}
