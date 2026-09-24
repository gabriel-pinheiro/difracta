import {
  type Catalog,
  childLayers,
  childrenOf,
  LAYER_LABELS,
  layerEffectivelyEnabled,
  linkAt,
  orderedEntries,
  type Controller,
  type Document,
  type Layer,
  type LayerKind,
  type Macro,
  type Table,
  type TreeEntity,
} from "@difracta/core";

/**
 * The shapes the CLI shows a Scene and the grouped tables in: a Scene's
 * Layers as the tree the navigator draws, top first, each with what it
 * renders and how loud; Controllers and Macros as their Groups' trees. The
 * builders read the document, the formatters turn a tree into lines.
 */
export interface LayerLevel {
  readonly field: "opacity" | "mix";
  readonly value: number;
  /** The Controller driving the level, when a Link does. */
  readonly controlledBy?: string;
}

export interface LayerNode {
  readonly id: string;
  readonly name: string;
  readonly kind: LayerKind;
  readonly enabled: boolean;
  /** Enabled and inside no disabled Group, so it renders. */
  readonly effectivelyEnabled: boolean;
  /** The Visual or Filter id, null while none is picked; a Group has none. */
  readonly definition?: string | null;
  readonly level?: LayerLevel;
  /** A Visual Layer's Target Surface, null while it has none. */
  readonly target?: { readonly id: string; readonly name?: string } | null;
  /** Paths the Visual follows that it cannot use yet, by the Visual's key; absent when none. */
  readonly missingPaths?: readonly MissingPath[];
  readonly children: readonly LayerNode[];
}

/** A Path a Visual declares that is unbound, or bound to a Path off the Target. */
export interface MissingPath {
  readonly key: string;
  readonly reason: "unbound" | "not on the Target";
}

/** Without a Catalog the Layers' Path needs are unknown and go unreported. */
export function sceneTree(
  document: Document,
  sceneId: string,
  catalog?: Catalog,
): readonly LayerNode[] {
  const build = (parentId: string | null): LayerNode[] =>
    childLayers(document.layers, sceneId, parentId).map((layer) =>
      layerNode(document, layer, build, catalog),
    );
  return build(null);
}

function layerNode(
  document: Document,
  layer: Layer,
  build: (parentId: string) => LayerNode[],
  catalog: Catalog | undefined,
): LayerNode {
  const base = {
    id: layer.id,
    name: layer.name,
    kind: layer.kind,
    enabled: layer.enabled,
    effectivelyEnabled: layerEffectivelyEnabled(document.layers, layer),
    children: layer.kind === "group" ? build(layer.id) : [],
  };
  if (layer.kind === "group") return base;
  const field = layer.kind === "visual" ? "opacity" : "mix";
  const link = linkAt(document, `layer/${layer.id}/${field}`);
  const controller =
    link === undefined ? undefined : document.controllers[link.controllerId];
  const level: LayerLevel = {
    field,
    value: layer.kind === "visual" ? layer.opacity : layer.mix,
    ...(controller === undefined ? {} : { controlledBy: controller.name }),
  };
  if (layer.kind === "filter")
    return { ...base, definition: layer.filter, level };
  const surface =
    layer.target === null ? undefined : document.surfaces[layer.target];
  const requirements =
    layer.visual === null || layer.target === null
      ? []
      : (catalog?.visual(layer.visual)?.paths ?? []);
  const missingPaths = requirements.flatMap((requirement): MissingPath[] => {
    const pathId = layer.paths[requirement.key];
    if (pathId === undefined)
      return [{ key: requirement.key, reason: "unbound" }];
    return document.paths[pathId]?.surfaceId === layer.target
      ? []
      : [{ key: requirement.key, reason: "not on the Target" }];
  });
  return {
    ...base,
    definition: layer.visual,
    level,
    target:
      layer.target === null
        ? null
        : { id: layer.target, ...(surface ? { name: surface.name } : {}) },
    ...(missingPaths.length === 0 ? {} : { missingPaths }),
  };
}

export function formatSceneTree(
  nodes: readonly LayerNode[],
  depth = 0,
): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${describeLayer(node)}`,
    ...formatSceneTree(node.children, depth + 1),
  ]);
}

function describeLayer(node: LayerNode): string {
  const parts = [
    `${LAYER_LABELS[node.kind]} “${node.name}”`,
    node.id,
    node.enabled ? (node.effectivelyEnabled ? "on" : "on (Group off)") : "off",
  ];
  if (node.kind !== "group")
    parts.push(
      node.definition ?? `(no ${node.kind === "visual" ? "Visual" : "Filter"})`,
    );
  if (node.level !== undefined)
    parts.push(
      `${node.level.field} ${percent(node.level.value)}${node.level.controlledBy === undefined ? "" : ` ← ${node.level.controlledBy}`}`,
    );
  if (node.target !== undefined)
    parts.push(
      node.target === null
        ? "→ no Target"
        : `→ ${node.target.name ?? node.target.id}`,
    );
  for (const missing of node.missingPaths ?? [])
    parts.push(`Path ${missing.key} ${missing.reason}`);
  return parts.join("  ");
}

function percent(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

export interface SceneRow {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly layers: number;
}

export function sceneRows(document: Document): readonly SceneRow[] {
  const layers = Object.values(document.layers);
  return orderedEntries(document.scenes).map((scene) => ({
    id: scene.id,
    name: scene.name,
    active: document.installation.activeScene === scene.id,
    layers: layers.filter((layer) => layer.sceneId === scene.id).length,
  }));
}

export function formatSceneRows(rows: readonly SceneRow[]): string[] {
  return rows.map(
    (row) =>
      `${row.active ? "▶" : " "} ${row.name}  ${row.id}  ${String(row.layers)} ${row.layers === 1 ? "Layer" : "Layers"}`,
  );
}

/** A grouped table entity with the entities its Group holds; a leaf has none. */
export type TreeNode<TEntity> = TEntity & {
  readonly children: readonly TreeNode<TEntity>[];
};

export function treeNodes<TEntity extends TreeEntity>(
  table: Table<TEntity>,
): readonly TreeNode<TEntity>[] {
  const build = (parentId: string | null): TreeNode<TEntity>[] =>
    childrenOf(table, parentId).map((entity) => ({
      ...entity,
      children: entity.kind === "group" ? build(entity.id) : [],
    }));
  return build(null);
}

export function formatTreeNodes<TEntity extends TreeEntity>(
  nodes: readonly TreeNode<TEntity>[],
  describe: (entity: TEntity) => string,
  depth = 0,
): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${describe(node)}`,
    ...formatTreeNodes(node.children, describe, depth + 1),
  ]);
}

export function describeController(controller: Controller): string {
  const head = `“${controller.name}”  ${controller.id}`;
  switch (controller.kind) {
    case "group":
      return `Group ${head}`;
    case "number":
      return `Number ${head}  value ${percent(controller.value)}`;
    case "color":
      return `Color ${head}  value [${controller.value.join(", ")}]`;
  }
}

export function describeMacro(macro: Macro): string {
  const head = `“${macro.name}”  ${macro.id}`;
  if (macro.kind === "group") return `Group ${head}`;
  const count = macro.actions.length;
  return `Macro ${head}  ${String(count)} ${count === 1 ? "action" : "actions"}`;
}
