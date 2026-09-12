import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { treeUngroup } from "../document/tree.ts";

/** Dissolves a Controller Group: its contents take its place, in their order. */
export const controllerUngroup = defineCommand({
  name: "controller.ungroup",
  kind: "authoring",
  description: "Replace a Controller Group by its contents.",
  payload: z.object({ controllerId: z.string().min(1) }).strict(),
  label: () => "Ungroup",
  apply({ document, payload }) {
    const group = document.controllers[payload.controllerId];
    if (group === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    const patches = treeUngroup(
      { name: "controllers", table: document.controllers, noun: "Controller" },
      group,
    );
    return "error" in patches ? rejected(patches.error) : accepted(patches);
  },
});
