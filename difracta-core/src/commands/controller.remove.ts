import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { descendantControllers } from "../document/controllers.ts";
import { tableEntries } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";
import { releaseLink } from "./link.remove.ts";

/** Removing a Controller releases its Links, each target keeping its current value; a Group goes with its contents. */
export const controllerRemove = defineCommand({
  name: "controller.remove",
  kind: "authoring",
  description:
    "Remove a Controller; its Links go and the targets keep their current values.",
  payload: z.object({ controllerId: z.string().min(1) }).strict(),
  label: () => "Remove Controller",
  apply(context) {
    const { document, payload } = context;
    const controller = document.controllers[payload.controllerId];
    if (controller === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    const removed = new Set<string>([
      controller.id,
      ...descendantControllers(document.controllers, controller.id).map(
        (child) => child.id,
      ),
    ]);
    const patches: Patch[] = [];
    for (const link of tableEntries(document.links))
      if (removed.has(link.controllerId))
        patches.push(...releaseLink(context, link));
    for (const id of removed)
      patches.push({ op: "remove", path: ["controllers", id] });
    return accepted(patches);
  },
});
