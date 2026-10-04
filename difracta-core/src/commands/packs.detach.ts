import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { BUNDLED_PACK_ID } from "../packs/ids.ts";
import { BUNDLED_NEVER_IN_TABLE } from "./packs.attach.ts";

/**
 * Detaches a Pack from the Installation. Layers and Macro actions holding
 * references into it are not rewritten: they read as missing until the
 * Pack is attached again. Nothing on disk is touched.
 */
export const packsDetach = defineCommand({
  name: "packs.detach",
  kind: "authoring",
  description:
    "Detach a Pack from the Installation; Layers using its entries keep their references and read as missing. The folder stays on disk.",
  payload: z.object({ packId: z.string().min(1) }).strict(),
  label: () => "Detach Pack",
  apply({ document, payload }) {
    if (payload.packId === BUNDLED_PACK_ID)
      return rejected(BUNDLED_NEVER_IN_TABLE);
    if (!(payload.packId in document.packs))
      return rejected(`Pack “${payload.packId}” is not attached.`);
    return accepted([{ op: "remove", path: ["packs", payload.packId] }]);
  },
});
