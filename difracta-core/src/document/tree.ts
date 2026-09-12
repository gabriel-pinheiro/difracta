import type { Table } from "./document.ts";
import { uniqueName } from "./names.ts";
import { orderedEntries, orderKeysAfter, orderKeysForMove } from "./order.ts";
import type { Patch } from "./patch.ts";

/**
 * A table arranged as a tree of Groups: Controllers and Macros share this
 * shape, so the navigator's move, ungroup and duplicate are written once.
 * An entity whose `kind` is "group" holds the ones whose `parentId` is its
 * id; `order` sorts siblings.
 */
export interface TreeEntity {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly order: string;
}

/** The entities directly under the root (`parentId` null) or a Group, in order. */
export function childrenOf<TEntity extends TreeEntity>(
  table: Table<TEntity>,
  parentId: string | null,
): readonly TEntity[] {
  return orderedEntries(table).filter((entity) => entity.parentId === parentId);
}

/** Every entity in navigator order: depth first from the root. */
export function flattenTree<TEntity extends TreeEntity>(
  table: Table<TEntity>,
): readonly TEntity[] {
  const result: TEntity[] = [];
  const visit = (parentId: string | null): void => {
    for (const child of childrenOf(table, parentId)) {
      result.push(child);
      if (child.kind === "group") visit(child.id);
    }
  };
  visit(null);
  return result;
}

/** Every entity below `id`, depth first in display order; empty unless it is a Group. */
export function descendantsOf<TEntity extends TreeEntity>(
  table: Table<TEntity>,
  id: string,
): readonly TEntity[] {
  const root = table[id];
  if (root?.kind !== "group") return [];
  const result: TEntity[] = [];
  const visit = (parent: TEntity): void => {
    for (const child of childrenOf(table, parent.id)) {
      result.push(child);
      if (child.kind === "group") visit(child);
    }
  };
  visit(root);
  return result;
}

/** What the tree helpers need to know about the table they patch. */
export interface TreeTable<TEntity extends TreeEntity> {
  readonly name: string;
  readonly table: Table<TEntity>;
  /** Entity noun for messages: "Controller", "Macro". */
  readonly noun: string;
}

export type TreePatches = readonly Patch[] | { readonly error: string };

/** A unique name among the entity's siblings, or nothing to change. */
export function treeRename<TEntity extends TreeEntity>(
  { name: tableName, table }: TreeTable<TEntity>,
  entity: TEntity,
  requested: string,
): TreePatches {
  const name = uniqueName(
    childrenOf(table, entity.parentId)
      .filter((sibling) => sibling.id !== entity.id)
      .map((sibling) => sibling.name),
    requested,
  );
  if (name === entity.name) return [];
  return [{ op: "set", path: [tableName, entity.id, "name"], value: name }];
}

/** Places an entity after a sibling (or first) at the root or in a Group; a Group carries its contents. */
export function treeMove<TEntity extends TreeEntity>(
  { name: tableName, table, noun }: TreeTable<TEntity>,
  entity: TEntity,
  parentId: string | null,
  after: string | null,
): TreePatches {
  if (parentId !== null) {
    const parent = table[parentId];
    if (parent?.kind !== "group")
      return { error: `“${parentId}” is not a ${noun} Group.` };
    if (
      parentId === entity.id ||
      descendantsOf(table, entity.id).some((child) => child.id === parentId)
    )
      return { error: "A Group cannot be moved into itself." };
  }
  if (after === entity.id)
    return { error: `A ${noun} cannot be placed after itself.` };
  const siblings = childrenOf(table, parentId).filter(
    (sibling) => sibling.id !== entity.id,
  );
  if (after !== null && !siblings.some((sibling) => sibling.id === after))
    return { error: `${noun} “${after}” is not in the destination.` };
  const patches: Patch[] = [];
  if (entity.parentId !== parentId)
    patches.push({
      op: "set",
      path: [tableName, entity.id, "parentId"],
      value: parentId,
    });
  const moving =
    entity.parentId === parentId ? entity : { id: entity.id, order: "" };
  for (const [changedId, order] of orderKeysForMove(siblings, moving, after))
    patches.push({
      op: "set",
      path: [tableName, changedId, "order"],
      value: order,
    });
  return patches;
}

/** Dissolves a Group: its contents take its place, in their order, renamed where a sibling has the name. */
export function treeUngroup<TEntity extends TreeEntity>(
  { name: tableName, table, noun }: TreeTable<TEntity>,
  group: TEntity,
): TreePatches {
  if (group.kind !== "group")
    return { error: `“${group.id}” is not a ${noun} Group.` };
  const children = childrenOf(table, group.id);
  const siblings = childrenOf(table, group.parentId);
  const index = siblings.findIndex((sibling) => sibling.id === group.id);
  const after = index <= 0 ? null : (siblings[index - 1]?.id ?? null);
  const others = siblings.filter((sibling) => sibling.id !== group.id);
  const keys = orderKeysAfter(others, after, children.length);
  if (keys === undefined)
    return {
      error: "The neighbours' order keys leave no room; move them first.",
    };
  const taken = others.map((sibling) => sibling.name);
  const patches: Patch[] = [];
  children.forEach((child, position) => {
    const name = uniqueName(taken, child.name);
    taken.push(name);
    patches.push(
      {
        op: "set",
        path: [tableName, child.id, "parentId"],
        value: group.parentId,
      },
      {
        op: "set",
        path: [tableName, child.id, "order"],
        value: keys[position] ?? child.order,
      },
    );
    if (name !== child.name)
      patches.push({
        op: "set",
        path: [tableName, child.id, "name"],
        value: name,
      });
  });
  patches.push({ op: "remove", path: [tableName, group.id] });
  return patches;
}

/**
 * A copy of the entity right after the original, uniquely named among its
 * siblings; a Group's contents are copied under it with fresh ids from
 * `nextId`. `adapt` finishes each copy (re-keyed contents, dropped fields).
 */
export function treeDuplicate<TEntity extends TreeEntity>(
  { name: tableName, table }: TreeTable<TEntity>,
  source: TEntity,
  copyId: string,
  nextId: () => string,
  adapt: (copy: TEntity) => TEntity = (copy) => copy,
): TreePatches {
  if (copyId in table) return { error: `“${copyId}” already exists.` };
  const siblings = childrenOf(table, source.parentId);
  const keys = orderKeysForMove(siblings, { id: copyId, order: "" }, source.id);
  const copy = adapt({
    ...source,
    id: copyId,
    name: uniqueName(
      siblings.map((sibling) => sibling.name),
      source.name,
    ),
    order: keys.get(copyId) ?? source.order,
  });
  const patches: Patch[] = [
    { op: "set", path: [tableName, copyId], value: copy },
  ];
  for (const [changedId, order] of keys) {
    if (changedId === copyId) continue;
    patches.push({
      op: "set",
      path: [tableName, changedId, "order"],
      value: order,
    });
  }
  const copyContents = (fromId: string, toId: string): void => {
    for (const child of childrenOf(table, fromId)) {
      const childId = nextId();
      patches.push({
        op: "set",
        path: [tableName, childId],
        value: adapt({ ...child, id: childId, parentId: toId }),
      });
      if (child.kind === "group") copyContents(child.id, childId);
    }
  };
  if (source.kind === "group") copyContents(source.id, copyId);
  return patches;
}
