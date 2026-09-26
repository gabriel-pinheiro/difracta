import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  ORDERED_TABLES,
  siblingsOf,
  type Document,
  type OrderedTableName,
} from "../document/document.ts";
import {
  orderedEntries,
  orderKeysForMove,
  type Ordered,
} from "../document/order.ts";
import type { Patch } from "../document/patch.ts";
import { surfaceChildren } from "../document/paths.ts";

const labels: Record<OrderedTableName, string> = {
  outputs: "Output",
  surfaces: "Surface",
  regions: "Region",
  masks: "Mask",
  paths: "Path",
  media: "Media",
  scenes: "Scene",
  layers: "Layer",
  controllers: "Controller",
  macros: "Macro",
};

/** Every ordered entity of the table `moving` sits in, with the table each patch goes to. */
function siblingTable(
  document: Document,
  tableName: OrderedTableName,
  moving: Ordered & { readonly surfaceId?: string },
): Readonly<Record<string, Ordered & { readonly table: OrderedTableName }>> {
  // Regions, Masks and Paths of one Surface share an order, so any moves among all.
  if (tableName === "regions" || tableName === "masks" || tableName === "paths")
    return Object.fromEntries(
      surfaceChildren(document, moving.surfaceId ?? "").map((child) => [
        child.entity.id,
        { id: child.entity.id, order: child.entity.order, table: child.table },
      ]),
    );
  const whole: Readonly<Record<string, Ordered>> = document[tableName];
  return Object.fromEntries(
    Object.entries(siblingsOf(tableName, whole, moving)).map(([id, entity]) => [
      id,
      { id, order: entity.order, table: tableName },
    ]),
  );
}

/** Places an entity right after a sibling (or first) among its siblings: its table, or its parent's children. */
export const entityMove = defineCommand({
  name: "entity.move",
  kind: "authoring",
  description: "Move an entity to a new position among its siblings.",
  payload: z
    .object({
      table: z.enum(ORDERED_TABLES),
      id: z.string().min(1),
      /** Sibling id to land after; null moves to the first position. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: ({ table }) => `Move ${labels[table]}`,
  coalesceKey: ({ table, id }) => `entity.move:${table}:${id}`,
  apply({ document, payload }) {
    // Only `id` and `order` matter here, which every ordered table shares.
    const whole: Readonly<Record<string, Ordered>> = document[payload.table];
    const moving = whole[payload.id];
    if (moving === undefined)
      return rejected(
        `${labels[payload.table]} “${payload.id}” does not exist.`,
      );
    if (payload.after === payload.id)
      return rejected("An entity cannot be placed after itself.");
    const table = siblingTable(document, payload.table, moving);
    if (payload.after !== null && !(payload.after in table))
      return rejected(
        `${labels[payload.table]} “${payload.after}” is not a sibling of “${payload.id}”.`,
      );
    const siblings = orderedEntries(table).filter(
      (entity) => entity.id !== moving.id,
    );
    const changes = orderKeysForMove(siblings, moving, payload.after);
    const patches: Patch[] = [...changes].map(([id, order]) => ({
      op: "set",
      path: [table[id]?.table ?? payload.table, id, "order"],
      value: order,
    }));
    return accepted(patches);
  },
});
