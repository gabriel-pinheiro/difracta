import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Surface } from "../document/document.ts";
import { FULL_FRAME } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey } from "../document/order.ts";
import { generateId, id } from "../ids.ts";

export const surfaceCreate = defineCommand({
  name: "surface.create",
  kind: "authoring",
  description:
    "Create a Surface, a real-world projection target, optionally assigned to an Output.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(120),
      /**
       * Output to assign; null for none. Omitted picks the only Output when
       * the Installation has exactly one, otherwise none.
       */
      output: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ name }) => `Create Surface “${name}”`,
  apply({ document, payload }) {
    const surfaceId =
      payload.id === undefined
        ? generateId("surface")
        : id("surface", payload.id);
    if (surfaceId in document.surfaces)
      return rejected(`Surface “${surfaceId}” already exists.`);
    const outputIds = Object.keys(document.outputs);
    const output =
      payload.output === undefined
        ? ((outputIds.length === 1 ? outputIds[0] : undefined) ?? null)
        : payload.output;
    if (output !== null && !(output in document.outputs))
      return rejected(`Output “${output}” does not exist.`);
    const name = uniqueName(
      tableEntries(document.surfaces).map((surface) => surface.name),
      payload.name,
    );
    const surface: Surface = {
      id: surfaceId,
      name,
      output,
      mappings:
        output === null
          ? {}
          : {
              [output]: { corners: FULL_FRAME },
            },
      order: appendOrderKey(document.surfaces),
    };
    return accepted([
      { op: "set", path: ["surfaces", surfaceId], value: surface },
    ]);
  },
});
