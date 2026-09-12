import { z } from "zod";

import { fireAddress } from "../address/fire.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";

/**
 * Firing a trigger Address. A Layer's Cue changes nothing in the document:
 * the outcome is an event, which the runtime announces to every session
 * subscribed to the document and an Output hands to the Layer's Visual
 * instance. A Scene's play sets the active Scene; a Macro's run performs
 * its actions. All of it is show input: never undone, and events are never
 * replayed to a session that connects later.
 */
export const addressTrigger = defineCommand({
  name: "address.trigger",
  kind: "performance",
  description:
    "Fire a trigger Address: layer/<id>/cue/<key>, scene/<id>/play or macro/<id>/run.",
  payload: z.object({ address: z.string().min(1) }).strict(),
  apply({ document, catalog, payload }) {
    const fired = fireAddress(document, catalog, payload.address);
    if (!fired.ok) return rejected(fired.error);
    return accepted(fired.patches, fired.events, fired.warnings);
  },
});
