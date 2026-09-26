import { z, type ZodType } from "zod";

import {
  generateId,
  type Id,
  type ControllerId,
  type InstallationId,
  type LinkId,
  type LayerId,
  type MacroId,
  type MaskId,
  type MediaId,
  type PathId,
  type RegionId,
  type SceneId,
  type OutputId,
  type SurfaceId,
} from "../ids.ts";
import { ColorSchema, ParameterValuesSchema } from "../catalog/parameters.ts";
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

/** Render Scale bounds: how much a Surface's Layer canvases are scaled. */
export const RENDER_SCALE = { min: 0.25, max: 2, step: 0.25 } as const;

/** A Surface's physical width and height, in any one unit; only the ratio matters. */
export const SurfaceSizeSchema = z
  .object({ width: z.number().positive(), height: z.number().positive() })
  .strict();
export type SurfaceSize = z.infer<typeof SurfaceSizeSchema>;

export const SurfaceSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    /** The Output this Surface renders through, or null while unassigned. */
    output: z.string().min(1).nullable(),
    /**
     * Multiplies the resolution of the canvases Layers targeting this
     * Surface render into; below 1 trades sharpness for throughput.
     */
    renderScale: z
      .number()
      .min(RENDER_SCALE.min)
      .max(RENDER_SCALE.max)
      .default(1),
    /**
     * The real shape of the Surface, which its projection cannot reveal at a
     * steep angle. Null derives the shape from the mapping, right whenever
     * the projector faces the Surface.
     */
    size: SurfaceSizeSchema.nullable().default(null),
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

/** The smallest side a Region may have, as a fraction of Surface Space. */
export const REGION_MIN_SIDE = 0.01;
/** Slack under the minimum side for float noise in rounded coordinates. */
const SIDE_TOLERANCE = 1e-9;

/** A Region's rectangle: its top-left and bottom-right corners in Surface Space. */
export const RegionBoundsSchema = z
  .object({ topLeft: PointSchema, bottomRight: PointSchema })
  .strict()
  .refine(
    ({ topLeft, bottomRight }) =>
      topLeft.x >= 0 &&
      topLeft.y >= 0 &&
      bottomRight.x <= 1 &&
      bottomRight.y <= 1 &&
      bottomRight.x - topLeft.x >= REGION_MIN_SIDE - SIDE_TOLERANCE &&
      bottomRight.y - topLeft.y >= REGION_MIN_SIDE - SIDE_TOLERANCE,
    {
      message: `Region bounds stay inside Surface Space with sides of at least ${String(REGION_MIN_SIDE)}.`,
    },
  );
export type RegionBounds = z.infer<typeof RegionBoundsSchema>;

/** The corners a Region is edited by. */
export const REGION_CORNERS = ["topLeft", "bottomRight"] as const;
export const RegionCornerSchema = z.enum(REGION_CORNERS);
export type RegionCorner = z.infer<typeof RegionCornerSchema>;

/**
 * An axis-aligned rectangle of Surface Space that Layers may target instead
 * of the whole Surface. It inherits the Surface's mapping and Masks, so
 * recalibrating the Surface moves every Region with it; it presents the
 * unit square (Region Space) to the Visual, like a Surface does. Names are
 * unique among the Regions of one Surface.
 */
export const RegionSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    surfaceId: z.string().min(1),
    bounds: RegionBoundsSchema,
    /** Position among the Regions, Masks and Paths of the same Surface, which share one order. */
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Region = Entity<typeof RegionSchema, RegionId>;

export const PATH_POINTS = { min: 2, max: 16 } as const;

/**
 * A polyline in Surface Space a Visual follows: two to sixteen points,
 * open or closed. Point order gives it a direction: Side A is the left of
 * travel and Side B the right, and a Visual with a side to choose reads
 * them that way. A Path lights nothing by itself; a Visual Layer binds one
 * to each Path its Visual declares.
 */
export const PathSchema = z
  .object({
    id: z.string().min(1),
    name: EntityName,
    surfaceId: z.string().min(1),
    points: z
      .array(PointSchema)
      .min(PATH_POINTS.min)
      .max(PATH_POINTS.max)
      .readonly(),
    closed: z.boolean(),
    /** Position among the Masks and Paths of the same Surface, which share one order. */
    order: z.string().min(1).default(DEFAULT_ORDER_KEY),
  })
  .strict();
export type Path = Entity<typeof PathSchema, PathId>;

/** Fields every Media item has, whatever its kind. */
const MediaBase = {
  id: z.string().min(1),
  name: EntityName,
  /** The Group containing the item, or null at the section's root; absent in older files. */
  parentId: z.string().min(1).nullable().default(null),
  /** Position among the Media items of the same parent; see `order.ts`. */
  order: z.string().min(1).default(DEFAULT_ORDER_KEY),
};

export const MEDIA_KINDS = ["file", "bundled", "group"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * A Media item is one image or video the Installation refers to, or a
 * Group arranging items in the navigator. A `file` item's `path` is
 * relative to the Installation file's folder, POSIX separators, `..`
 * allowed; a `bundled` item names a Bundled Media entry of the Catalog by
 * id, and one the Catalog lacks stays, unavailable. The type (image or
 * video) is read from the file's extension or the entry
 * (`document/media.ts`) and never stored. Names are unique among siblings.
 * An item without a `kind`, as older files hold, is a file.
 */
export const MediaSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...MediaBase,
      kind: z.literal("file").default("file"),
      path: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...MediaBase,
      kind: z.literal("bundled"),
      bundled: z.string().min(1),
    })
    .strict(),
  z.object({ ...MediaBase, kind: z.literal("group") }).strict(),
]);
export type Media = Entity<typeof MediaSchema, MediaId>;
export type MediaFile = Extract<Media, { kind: "file" }>;
export type MediaBundled = Extract<Media, { kind: "bundled" }>;

export const CALIBRATION_VIEWS = ["selected", "outlines", "patterns"] as const;
export const CalibrationViewSchema = z.enum(CALIBRATION_VIEWS);
export type CalibrationView = z.infer<typeof CalibrationViewSchema>;

/**
 * Calibration Mode: one Surface (or one of its Masks or Paths) shown as a pattern on
 * its Output instead of the dim fill. `owner` is the live session that
 * entered it, so the runtime can clear it when that session goes away.
 */
export const CalibrationSchema = z
  .object({
    surfaceId: z.string().min(1),
    /** Mask being aligned, with its Masks applied; null aligns the quad. */
    maskId: z.string().min(1).nullable(),
    /** Path being aligned, with the Masks applied; exclusive with `maskId`. */
    pathId: z.string().min(1).nullable(),
    /** Region being aligned, with the Masks applied; exclusive with both. */
    regionId: z.string().min(1).nullable().default(null),
    /**
     * Corner, Mask point or Path point highlighted on the Output; while a
     * Region is aligned, one of its two corners.
     */
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
export const BLEND_MODE_LABELS: Readonly<Record<BlendMode, string>> = {
  normal: "Normal",
  additive: "Additive",
};
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
      /** Values for the Visual's Parameters, by name; empty without a Visual. */
      parameters: ParameterValuesSchema.default({}),
      /** Surface the Layer renders into; null renders nowhere. */
      target: z.string().min(1).nullable(),
      /**
       * The Path bound to each Path the Visual declares, by its key. A key
       * left unbound keeps the Layer from rendering until a Path is picked.
       */
      paths: z.record(z.string().min(1), z.string().min(1)).default({}),
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
      parameters: ParameterValuesSchema.default({}),
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

/** Fields every Controller has, whatever its kind. */
const ControllerBase = {
  id: z.string().min(1),
  name: EntityName,
  /** The Group containing the Controller, or null at the section's root. */
  parentId: z.string().min(1).nullable(),
  /** Position among the Controllers of the same parent. */
  order: z.string().min(1).default(DEFAULT_ORDER_KEY),
};

export const CONTROLLER_KINDS = ["number", "color", "group"] as const;
export type ControllerKind = (typeof CONTROLLER_KINDS)[number];

/**
 * A Controller is one Installation-wide value that Parameter Links spread
 * over many Layers: a Number Controller holds 0 to 1, a Color Controller a
 * color. Its value is part of the file, so a Color Controller doubles as a
 * saved palette entry. A Group only arranges Controllers in the navigator.
 */
export const ControllerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...ControllerBase,
      kind: z.literal("number"),
      value: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({ ...ControllerBase, kind: z.literal("color"), value: ColorSchema })
    .strict(),
  z.object({ ...ControllerBase, kind: z.literal("group") }).strict(),
]);
export type Controller = Entity<typeof ControllerSchema, ControllerId>;
export type NumberController = Extract<Controller, { kind: "number" }>;
export type ColorController = Extract<Controller, { kind: "color" }>;

/**
 * A Parameter Link makes a Controller drive one Address. A number link maps
 * the Controller's 0 and 1 onto `from` and `to` in the target's units,
 * linearly, reversed when `from` is the larger; a color link copies the
 * color. An Address has at most one Link, and the value authored under it
 * stays in the document, dormant until the Link goes.
 */
export const LinkSchema = z
  .object({
    id: z.string().min(1),
    controllerId: z.string().min(1),
    address: z.string().min(1),
    /** Target values at Controller 0 and 1; null for color links. */
    anchors: z.object({ from: z.number(), to: z.number() }).strict().nullable(),
  })
  .strict();
export type Link = Entity<typeof LinkSchema, LinkId>;
export type LinkAnchors = NonNullable<Link["anchors"]>;

/** Fields every Macro has, whatever its kind. */
const MacroBase = {
  id: z.string().min(1),
  name: EntityName,
  /** The Group containing the Macro, or null at the section's root. */
  parentId: z.string().min(1).nullable(),
  /** Position among the Macros of the same parent. */
  order: z.string().min(1).default(DEFAULT_ORDER_KEY),
};

export const MACRO_KINDS = ["macro", "group"] as const;
export type MacroKind = (typeof MACRO_KINDS)[number];

/** What an Address can hold: a number, a switch, a choice's value or a color. */
export const AddressValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  ColorSchema,
]);

/**
 * One step of a Macro, on one Address: `set` writes a value, `toggle` flips
 * a boolean, `trigger` fires a trigger Address such as a Cue, a Scene's play
 * or another Macro's run.
 */
/**
 * An action's Chance: the probability, 0 to 1, that it fires once its
 * Macro's Run Mode picked it. Absent means always.
 */
export const ChanceSchema = z.number().min(0).max(1);

/** Fields every action has, whatever its kind. */
const ActionBase = {
  id: z.string().min(1),
  address: z.string().min(1),
  chance: ChanceSchema.optional(),
};

export const MacroActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...ActionBase,
      kind: z.literal("set"),
      value: AddressValueSchema,
    })
    .strict(),
  z.object({ ...ActionBase, kind: z.literal("toggle") }).strict(),
  z.object({ ...ActionBase, kind: z.literal("trigger") }).strict(),
]);
/** Action ids are plain strings: unique within their Macro, never a table key. */
export type MacroAction = z.infer<typeof MacroActionSchema>;
export type MacroActionKind = MacroAction["kind"];

/**
 * How a Macro's run chooses among its actions: `all` runs every one, `one`
 * picks one at random, `some` picks `count` at random, `sequence` runs the
 * next one in order each time and wraps.
 */
export const RUN_MODES = ["all", "one", "some", "sequence"] as const;
export type RunMode = (typeof RUN_MODES)[number];

/**
 * A Macro is a named, ordered list of actions run as one performance step
 * from its trigger Address `macro/<id>/run`: a look, a hit, a state. Its
 * Run Mode says which actions a run picks; `count` is how many when the
 * mode is `some`, kept while another mode is on. A Group only arranges
 * Macros in the navigator.
 */
export const MacroSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...MacroBase,
      kind: z.literal("macro"),
      actions: z.array(MacroActionSchema),
      mode: z.enum(RUN_MODES).default("all"),
      count: z.number().int().min(1).default(1),
    })
    .strict(),
  z.object({ ...MacroBase, kind: z.literal("group") }).strict(),
]);
export type Macro = Entity<typeof MacroSchema, MacroId>;
export type RunnableMacro = Extract<Macro, { kind: "macro" }>;

export const OperationalSchema = z
  .object({
    blackout: z.boolean(),
    calibration: CalibrationSchema.nullable(),
    /**
     * Where each Sequence Macro is, by Macro id: the index of the action
     * its next run fires. Show state, so every Macro starts at the top
     * when the document opens; read modulo the action count, so editing
     * the list never breaks it.
     */
    sequence: z.record(z.string(), z.number().int().nonnegative()),
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
    regions: z.record(z.string(), RegionSchema),
    masks: z.record(z.string(), MaskSchema),
    paths: z.record(z.string(), PathSchema),
    media: z.record(z.string(), MediaSchema),
    scenes: z.record(z.string(), SceneSchema),
    layers: z.record(z.string(), LayerSchema),
    controllers: z.record(z.string(), ControllerSchema),
    links: z.record(z.string(), LinkSchema),
    macros: z.record(z.string(), MacroSchema),
    operational: OperationalSchema,
  })
  .strict();

export interface Document {
  readonly installation: Installation;
  readonly outputs: Table<Output>;
  readonly surfaces: Table<Surface>;
  readonly regions: Table<Region>;
  readonly masks: Table<Mask>;
  readonly paths: Table<Path>;
  readonly media: Table<Media>;
  readonly scenes: Table<Scene>;
  readonly layers: Table<Layer>;
  readonly controllers: Table<Controller>;
  readonly links: Table<Link>;
  readonly macros: Table<Macro>;
  readonly operational: Operational;
}

/** Entity table schemas, keyed by the table's name in the Document. */
export const TABLE_SCHEMAS = {
  outputs: OutputSchema,
  surfaces: SurfaceSchema,
  regions: RegionSchema,
  masks: MaskSchema,
  paths: PathSchema,
  media: MediaSchema,
  scenes: SceneSchema,
  layers: LayerSchema,
  controllers: ControllerSchema,
  links: LinkSchema,
  macros: MacroSchema,
} as const;
export type TableName = keyof typeof TABLE_SCHEMAS;

/** Tables whose entities carry an `order` key and can be rearranged. */
export const ORDERED_TABLES = [
  "outputs",
  "surfaces",
  "regions",
  "masks",
  "paths",
  "media",
  "scenes",
  "layers",
  "controllers",
  "macros",
] as const satisfies readonly TableName[];
export type OrderedTableName = (typeof ORDERED_TABLES)[number];

/**
 * Ordered tables whose entities are children: siblings share the values of
 * these fields, and order keys and names are unique only among siblings.
 */
export const PARENT_FIELDS: Partial<
  Record<OrderedTableName, readonly string[]>
> = {
  regions: ["surfaceId"],
  masks: ["surfaceId"],
  paths: ["surfaceId"],
  layers: ["sceneId", "parentId"],
  media: ["parentId"],
  controllers: ["parentId"],
  macros: ["parentId"],
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
  sequence: {},
};

export function emptyDocument(name: string): Document {
  return {
    installation: { id: generateId("installation"), name, activeScene: null },
    outputs: {},
    surfaces: {},
    regions: {},
    masks: {},
    paths: {},
    media: {},
    scenes: {},
    layers: {},
    controllers: {},
    links: {},
    macros: {},
    operational: defaultOperational,
  };
}

export function tableEntries<TEntity extends { readonly id: string }>(
  table: Table<TEntity>,
): readonly TEntity[] {
  return Object.values(table);
}
