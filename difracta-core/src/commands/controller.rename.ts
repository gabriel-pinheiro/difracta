import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeRename } from "../document/tree.ts";

export const controllerRename = defineCommand({
  name: "controller.rename",
  kind: "authoring",
  description: "Rename a Controller.",
  payload: z
    .object({
      controllerId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Controller",
  coalesceKey: ({ controllerId }) => `controller.rename:${controllerId}`,
  apply({ document, payload }) {
    const controller = document.controllers[payload.controllerId];
    if (controller === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    const patches = treeRename(
      { name: "controllers", table: document.controllers, noun: "Controller" },
      controller,
      payload.name,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
