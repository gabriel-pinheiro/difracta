import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Path } from "../document/document.ts";
import { insetPolygon } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { surfaceChildren } from "../document/paths.ts";
import { generateId, id } from "../ids.ts";
import { settings } from "../settings.ts";

/** A new Path is a closed rectangle inset from the Surface's edges, after the Surface's other children. */
export const pathCreate = defineCommand({
  name: "path.create",
  kind: "authoring",
  description: "Create a Path on a Surface.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      surfaceId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: ({ name }) => `Create Path “${name}”`,
  apply({ document, payload }) {
    const pathId =
      payload.id === undefined ? generateId("path") : id("path", payload.id);
    if (pathId in document.paths)
      return rejected(`Path “${pathId}” already exists.`);
    if (!(payload.surfaceId in document.surfaces))
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const children = surfaceChildren(document, payload.surfaceId);
    const path: Path = {
      id: pathId,
      name: uniqueName(
        tableEntries(document.paths)
          .filter((sibling) => sibling.surfaceId === payload.surfaceId)
          .map((sibling) => sibling.name),
        payload.name,
      ),
      surfaceId: payload.surfaceId,
      points: insetPolygon(settings.paths.defaultInset),
      closed: true,
      order: appendOrderKey(
        Object.fromEntries(
          children.map((child) => [child.entity.id, child.entity]),
        ),
      ),
    };
    return accepted([{ op: "set", path: ["paths", pathId], value: path }]);
  },
});
