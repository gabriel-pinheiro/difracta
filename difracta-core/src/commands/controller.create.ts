import { z } from "zod";

import { resolveAddress, type ResolvedAddress } from "../address/address.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  childControllers,
  CONTROLLER_LABELS,
} from "../document/controllers.ts";
import type { Color } from "../catalog/parameters.ts";
import { CONTROLLER_KINDS, type Controller } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { getAtPath } from "../document/patch.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";
import { linkPatches } from "./link.create.ts";

/**
 * A new Controller lands first at the root or in the Group it was added to,
 * or right after the sibling `after` names: Number at 0, Color opaque white. With `addresses` it is linked to them in
 * the same step, which is how a Parameter row grows its own Controller, and
 * it starts at the value that leaves the first target where it is.
 */
export const controllerCreate = defineCommand({
  name: "controller.create",
  kind: "authoring",
  description:
    "Add a Number Controller, a Color Controller or a Group; addresses link it at once.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(CONTROLLER_KINDS),
      /** Group to add into; null for the root. */
      parentId: z.string().min(1).nullable().default(null),
      name: z.string().trim().min(1).max(120).optional(),
      /** Addresses the new Controller drives from the start. */
      addresses: z.array(z.string().min(1)).optional(),
      /** Sibling to land after; null or absent for first. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ kind }) => `Add ${CONTROLLER_LABELS[kind]}`,
  apply({ document, catalog, payload }) {
    const first =
      payload.addresses?.[0] === undefined
        ? undefined
        : resolveAddress(document, payload.addresses[0], catalog);
    const current =
      first === undefined ? undefined : getAtPath(document, first.path);
    const controllerId =
      payload.id === undefined
        ? generateId("controller")
        : id("controller", payload.id);
    if (controllerId in document.controllers)
      return rejected(`Controller “${controllerId}” already exists.`);
    if (payload.parentId !== null) {
      const parent = document.controllers[payload.parentId];
      if (parent?.kind !== "group")
        return rejected(`“${payload.parentId}” is not a Controller Group.`);
    }
    const siblings = childControllers(document.controllers, payload.parentId);
    const order = orderKeyForNew(siblings, payload.after ?? null, "Controller");
    if (typeof order !== "string") return rejected(order.error);
    const base = {
      id: controllerId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? CONTROLLER_LABELS[payload.kind],
      ),
      parentId: payload.parentId,
      order,
    };
    const controller: Controller =
      payload.kind === "number"
        ? { ...base, kind: "number", value: startingNumber(first, current) }
        : payload.kind === "color"
          ? {
              ...base,
              kind: "color",
              value:
                first?.type === "color" && Array.isArray(current)
                  ? (current as unknown as Color)
                  : [1, 1, 1, 1],
            }
          : { ...base, kind: "group" };
    const links =
      payload.addresses === undefined
        ? []
        : linkPatches(document, catalog, controller, payload.addresses);
    if ("error" in links) return rejected(links.error);
    return accepted([
      { op: "set", path: ["controllers", controllerId], value: controller },
      ...links,
    ]);
  },
});

/** Where a Number Controller starts so its first target keeps its value: the value's place in the target's range, or on/off for a switch. */
function startingNumber(
  first: ResolvedAddress | undefined,
  current: unknown,
): number {
  if (first === undefined) return 0;
  if (first.type === "boolean") return current === true ? 1 : 0;
  if (first.type !== "number" || typeof current !== "number") return 0;
  const range = first.range ?? { min: 0, max: 1 };
  const span = range.max - range.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (current - range.min) / span));
}
