import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import {
  childControllers,
  CONTROLLER_LABELS,
} from "../document/controllers.ts";
import { CONTROLLER_KINDS, type Controller } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { generateId, id } from "../ids.ts";

/** A new Controller lands first at the root or in the Group it was added to: Number at 0, Color opaque white. */
export const controllerCreate = defineCommand({
  name: "controller.create",
  kind: "authoring",
  description: "Add a Number Controller, a Color Controller or a Group.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      kind: z.enum(CONTROLLER_KINDS),
      /** Group to add into; null for the root. */
      parentId: z.string().min(1).nullable().default(null),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  label: ({ kind }) => `Add ${CONTROLLER_LABELS[kind]}`,
  apply({ document, payload }) {
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
    const base = {
      id: controllerId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? CONTROLLER_LABELS[payload.kind],
      ),
      parentId: payload.parentId,
      order: generateKeyBetween(null, siblings[0]?.order ?? null),
    };
    const controller: Controller =
      payload.kind === "number"
        ? { ...base, kind: "number", value: 0 }
        : payload.kind === "color"
          ? { ...base, kind: "color", value: [1, 1, 1, 1] }
          : { ...base, kind: "group" };
    return accepted([
      { op: "set", path: ["controllers", controllerId], value: controller },
    ]);
  },
});
