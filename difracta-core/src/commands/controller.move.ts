import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  childControllers,
  descendantControllers,
} from "../document/controllers.ts";
import { orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";

/** Places a Controller after a sibling (or first) at the root or in a Group; a Group carries its contents. */
export const controllerMove = defineCommand({
  name: "controller.move",
  kind: "authoring",
  description: "Move a Controller within or across Groups.",
  payload: z
    .object({
      controllerId: z.string().min(1),
      parentId: z.string().min(1).nullable(),
      /** Sibling to land after in the destination; null for the top. */
      after: z.string().min(1).nullable(),
    })
    .strict(),
  label: () => "Move Controller",
  coalesceKey: ({ controllerId }) => `controller.move:${controllerId}`,
  apply({ document, payload }) {
    const controller = document.controllers[payload.controllerId];
    if (controller === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    if (payload.parentId !== null) {
      const parent = document.controllers[payload.parentId];
      if (parent?.kind !== "group")
        return rejected(`“${payload.parentId}” is not a Controller Group.`);
      const descendants = descendantControllers(
        document.controllers,
        controller.id,
      );
      if (
        payload.parentId === controller.id ||
        descendants.some((child) => child.id === payload.parentId)
      )
        return rejected("A Group cannot be moved into itself.");
    }
    if (payload.after === controller.id)
      return rejected("A Controller cannot be placed after itself.");
    const siblings = childControllers(
      document.controllers,
      payload.parentId,
    ).filter((sibling) => sibling.id !== controller.id);
    if (payload.after !== null && !siblings.some((s) => s.id === payload.after))
      return rejected(
        `Controller “${payload.after}” is not in the destination.`,
      );
    const patches: Patch[] = [];
    if (controller.parentId !== payload.parentId)
      patches.push({
        op: "set",
        path: ["controllers", controller.id, "parentId"],
        value: payload.parentId,
      });
    const moving =
      controller.parentId === payload.parentId
        ? controller
        : { id: controller.id, order: "" };
    for (const [changedId, order] of orderKeysForMove(
      siblings,
      moving,
      payload.after,
    ))
      patches.push({
        op: "set",
        path: ["controllers", changedId, "order"],
        value: order,
      });
    return accepted(patches);
  },
});
