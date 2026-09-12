import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeMove } from "../document/tree.ts";

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
    const patches = treeMove(
      { name: "controllers", table: document.controllers, noun: "Controller" },
      controller,
      payload.parentId,
      payload.after,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
