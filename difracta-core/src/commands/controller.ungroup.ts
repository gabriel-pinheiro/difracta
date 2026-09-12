import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { childControllers } from "../document/controllers.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeysAfter } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";

/** Dissolves a Controller Group: its contents take its place, in their order. */
export const controllerUngroup = defineCommand({
  name: "controller.ungroup",
  kind: "authoring",
  description: "Replace a Controller Group by its contents.",
  payload: z.object({ controllerId: z.string().min(1) }).strict(),
  label: () => "Ungroup",
  apply({ document, payload }) {
    const group = document.controllers[payload.controllerId];
    if (group?.kind !== "group")
      return rejected(`“${payload.controllerId}” is not a Controller Group.`);
    const children = childControllers(document.controllers, group.id);
    const siblings = childControllers(document.controllers, group.parentId);
    const index = siblings.findIndex((sibling) => sibling.id === group.id);
    const after = index <= 0 ? null : (siblings[index - 1]?.id ?? null);
    const others = siblings.filter((sibling) => sibling.id !== group.id);
    const keys = orderKeysAfter(others, after, children.length);
    if (keys === undefined)
      return rejected(
        "The neighbours' order keys leave no room; move them first.",
      );
    const taken = others.map((sibling) => sibling.name);
    const patches: Patch[] = [];
    children.forEach((child, position) => {
      const name = uniqueName(taken, child.name);
      taken.push(name);
      patches.push(
        {
          op: "set",
          path: ["controllers", child.id, "parentId"],
          value: group.parentId,
        },
        {
          op: "set",
          path: ["controllers", child.id, "order"],
          value: keys[position] ?? child.order,
        },
      );
      if (name !== child.name)
        patches.push({
          op: "set",
          path: ["controllers", child.id, "name"],
          value: name,
        });
    });
    patches.push({ op: "remove", path: ["controllers", group.id] });
    return accepted(patches);
  },
});
