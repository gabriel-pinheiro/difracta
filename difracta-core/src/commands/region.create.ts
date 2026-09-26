import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries, type Region } from "../document/document.ts";
import { roundPoint } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { surfaceChildren } from "../document/paths.ts";
import { generateId, id } from "../ids.ts";
import { settings } from "../settings.ts";

/** A new Region is a rectangle inset from the Surface's edges, after the Surface's other children. */
export const regionCreate = defineCommand({
  name: "region.create",
  kind: "authoring",
  description:
    "Create a Region on a Surface: a rectangle of it Layers can target.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      surfaceId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: ({ name }) => `Create Region “${name}”`,
  apply({ document, payload }) {
    const regionId =
      payload.id === undefined
        ? generateId("region")
        : id("region", payload.id);
    if (regionId in document.regions)
      return rejected(`Region “${regionId}” already exists.`);
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const draft = { id: regionId, surfaceId: payload.surfaceId };
    const siblings = siblingsOf("regions", document.regions, draft as Region);
    const inset = settings.regions.defaultInset;
    const region: Region = {
      ...draft,
      name: uniqueName(
        tableEntries(siblings).map((sibling) => sibling.name),
        payload.name,
      ),
      bounds: {
        topLeft: roundPoint({ x: inset, y: inset }),
        bottomRight: roundPoint({ x: 1 - inset, y: 1 - inset }),
      },
      order: appendOrderKey(
        Object.fromEntries(
          surfaceChildren(document, payload.surfaceId).map((child) => [
            child.entity.id,
            child.entity,
          ]),
        ),
      ),
    };
    return accepted([
      { op: "set", path: ["regions", regionId], value: region },
    ]);
  },
});
