import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { childControllers } from "../document/controllers.ts";
import { uniqueName } from "../document/names.ts";

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
    const name = uniqueName(
      childControllers(document.controllers, controller.parentId)
        .filter((sibling) => sibling.id !== controller.id)
        .map((sibling) => sibling.name),
      payload.name,
    );
    if (name === controller.name) return accepted([]);
    return accepted([
      { op: "set", path: ["controllers", controller.id, "name"], value: name },
    ]);
  },
});
