import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeDuplicate } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/** A copy of the Controller with its value, right after the original; its Links are not copied, since an Address has one Link. */
export const controllerDuplicate = defineCommand({
  name: "controller.duplicate",
  kind: "authoring",
  description: "Duplicate a Controller below itself, without its Links.",
  payload: z
    .object({
      controllerId: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .strict(),
  label: () => "Duplicate Controller",
  apply({ document, payload }) {
    const source = document.controllers[payload.controllerId];
    if (source === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    const copyId =
      payload.id === undefined
        ? generateId("controller")
        : id("controller", payload.id);
    const patches = treeDuplicate(
      { name: "controllers", table: document.controllers, noun: "Controller" },
      source,
      copyId,
      () => generateId("controller"),
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
