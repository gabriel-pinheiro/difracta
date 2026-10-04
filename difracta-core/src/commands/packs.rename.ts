import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { BUNDLED_PACK_ID } from "../packs/ids.ts";
import { BUNDLED_NEVER_IN_TABLE } from "./packs.attach.ts";

/**
 * Changes the Installation's copy of a Pack's name. The runtime's
 * `packs.rename` request writes the manifest and then runs this, so the copy
 * follows the Pack.
 */
export const packsRename = defineCommand({
  name: "packs.rename",
  kind: "authoring",
  description:
    "Change the Installation's copy of an attached Pack's name; the runtime request packs.rename writes the Pack's manifest too.",
  payload: z
    .object({
      packId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  label: () => "Rename Pack",
  coalesceKey: ({ packId }) => `packs.rename:${packId}`,
  apply({ document, payload }) {
    if (payload.packId === BUNDLED_PACK_ID)
      return rejected(BUNDLED_NEVER_IN_TABLE);
    const pack = document.packs[payload.packId];
    if (pack === undefined)
      return rejected(`Pack “${payload.packId}” is not attached.`);
    if (pack.name === payload.name) return accepted([]);
    return accepted([
      {
        op: "set",
        path: ["packs", payload.packId, "name"],
        value: payload.name,
      },
    ]);
  },
});
