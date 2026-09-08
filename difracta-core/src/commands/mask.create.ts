import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries, type Mask } from "../document/document.ts";
import { insetPolygon } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { generateId, id } from "../ids.ts";
import { settings } from "../settings.ts";

/** A new Mask is an include rectangle inset from the Surface's edges, with no feather. */
export const maskCreate = defineCommand({
  name: "mask.create",
  kind: "authoring",
  description: "Create a Mask on a Surface.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      surfaceId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: ({ name }) => `Create Mask “${name}”`,
  apply({ document, payload }) {
    const maskId =
      payload.id === undefined ? generateId("mask") : id("mask", payload.id);
    if (maskId in document.masks)
      return rejected(`Mask “${maskId}” already exists.`);
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const draft = { id: maskId, surfaceId: payload.surfaceId };
    const siblings = siblingsOf("masks", document.masks, draft as Mask);
    const mask: Mask = {
      ...draft,
      name: uniqueName(
        tableEntries(siblings).map((sibling) => sibling.name),
        payload.name,
      ),
      mode: "include",
      points: insetPolygon(settings.masks.defaultInset),
      feather: 0,
      order: appendOrderKey(siblings),
    };
    return accepted([{ op: "set", path: ["masks", maskId], value: mask }]);
  },
});
