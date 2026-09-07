import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { ORDERED_TABLES, type OrderedTableName } from "../document/document.ts";
import { orderedEntries, orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";

const labels: Record<OrderedTableName, string> = { outputs: "Output" };

/** Places an entity right after a sibling (or first) within its table. */
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
    const table = document[payload.table];
    const moving = table[payload.id];
    if (moving === undefined)
      return rejected(
        `${labels[payload.table]} “${payload.id}” does not exist.`,
      );
    if (payload.after === payload.id)
      return rejected("An entity cannot be placed after itself.");
    if (payload.after !== null && !(payload.after in table))
      return rejected(
        `${labels[payload.table]} “${payload.after}” does not exist.`,
      );
    const siblings = orderedEntries(table).filter(
      (entity) => entity.id !== moving.id,
    );
    const changes = orderKeysForMove(siblings, moving, payload.after);
    const patches: Patch[] = [...changes].map(([id, order]) => ({
      op: "set",
      path: [payload.table, id, "order"],
      value: order,
    }));
    return accepted(patches);
  },
});
