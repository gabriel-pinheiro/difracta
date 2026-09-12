import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { childControllers } from "../document/controllers.ts";
import type { Controller, Document } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeysForMove } from "../document/order.ts";
import type { Patch } from "../document/patch.ts";
import { generateId, id } from "../ids.ts";

/** Patches copying `controllers` (siblings, in order) with their contents under `parentId`, keeping their keys. */
function copyControllers(
  document: Document,
  controllers: readonly Controller[],
  parentId: string | null,
): Patch[] {
  const patches: Patch[] = [];
  for (const source of controllers) {
    const copyId = generateId("controller");
    patches.push({
      op: "set",
      path: ["controllers", copyId],
      value: { ...source, id: copyId, parentId },
    });
    if (source.kind === "group")
      patches.push(
        ...copyControllers(
          document,
          childControllers(document.controllers, source.id),
          copyId,
        ),
      );
  }
  return patches;
}

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
    if (copyId in document.controllers)
      return rejected(`Controller “${copyId}” already exists.`);
    const siblings = childControllers(document.controllers, source.parentId);
    const keys = orderKeysForMove(
      siblings,
      { id: copyId, order: "" },
      source.id,
    );
    const copy: Controller = {
      ...source,
      id: copyId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        source.name,
      ),
      order: keys.get(copyId) ?? source.order,
    };
    const patches: Patch[] = [
      { op: "set", path: ["controllers", copyId], value: copy },
    ];
    for (const [changedId, order] of keys) {
      if (changedId === copyId) continue;
      patches.push({
        op: "set",
        path: ["controllers", changedId, "order"],
        value: order,
      });
    }
    if (source.kind === "group")
      patches.push(
        ...copyControllers(
          document,
          childControllers(document.controllers, source.id),
          copyId,
        ),
      );
    return accepted(patches);
  },
});
