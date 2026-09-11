import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { SurfaceSizeSchema } from "../document/document.ts";

/**
 * States a Surface's real shape as a width and height, or returns it to
 * automatic, where the shape follows the mapping.
 */
export const surfaceSize = defineCommand({
  name: "surface.size",
  kind: "authoring",
  description:
    "Set a Surface's physical width and height (any unit, only the ratio matters), or null for automatic.",
  payload: z
    .object({
      surfaceId: z.string().min(1),
      size: SurfaceSizeSchema.nullable(),
    })
    .strict(),
  label: ({ size }) =>
    size === null ? "Automatic Surface size" : "Set Surface size",
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const same =
      surface.size === null || payload.size === null
        ? surface.size === payload.size
        : surface.size.width === payload.size.width &&
          surface.size.height === payload.size.height;
    if (same) return accepted([]);
    return accepted([
      {
        op: "set",
        path: ["surfaces", surface.id, "size"],
        value: payload.size,
      },
    ]);
  },
});
