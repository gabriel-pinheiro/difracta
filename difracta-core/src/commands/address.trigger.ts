import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";

/**
 * Firing a trigger Address, such as a Layer's Cue. Nothing in the document
 * changes: the command's outcome is an event, which the runtime announces
 * to every session subscribed to the document and an Output hands to the
 * Layer's Visual instance. It is show input: never stored, never undone,
 * not replayed to a session that connects later.
 */
export const addressTrigger = defineCommand({
  name: "address.trigger",
  kind: "performance",
  description: "Fire a trigger Address, such as layer/<id>/cue/<key>.",
  payload: z.object({ address: z.string().min(1) }).strict(),
  apply({ document, payload, catalog }) {
    const resolved = resolveAddress(document, payload.address, catalog);
    if (resolved === undefined)
      return rejected(`Unknown address “${payload.address}”.`);
    if (resolved.type !== "trigger")
      return rejected(`Address “${payload.address}” is not a trigger.`);
    return accepted([], [payload.address]);
  },
});
