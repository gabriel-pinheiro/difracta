import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { tableEntries, type Surface } from "../document/document.ts";
import { FULL_FRAME } from "../document/geometry.ts";
import { uniqueName } from "../document/names.ts";
import { appendOrderKey, orderedEntries } from "../document/order.ts";
import { generateId, id } from "../ids.ts";

export const surfaceCreate = defineCommand({
  name: "surface.create",
  kind: "authoring",
  description:
    "Create a Surface, a real-world projection target, on the first Output or on the ones named.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(120),
      /**
       * Outputs to put it on; empty for none. Omitted picks the first Output
       * in order, or none when the Installation has no Outputs.
       */
      outputs: z.array(z.string().min(1)).optional(),
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
    const first = orderedEntries(document.outputs)[0];
    const outputs = payload.outputs ?? (first === undefined ? [] : [first.id]);
    for (const output of outputs)
      if (!(output in document.outputs))
        return rejected(`Output “${output}” does not exist.`);
    const name = uniqueName(
      tableEntries(document.surfaces).map((surface) => surface.name),
      payload.name,
    );
    const surface: Surface = {
      id: surfaceId,
      name,
      renderScale: 1,
      size: null,
      mappings: Object.fromEntries(
        outputs.map((output) => [
          output,
          { enabled: true, corners: FULL_FRAME },
        ]),
      ),
      order: appendOrderKey(document.surfaces),
    };
    return accepted([
      { op: "set", path: ["surfaces", surfaceId], value: surface },
    ]);
  },
});
