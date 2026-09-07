import { z } from "zod";

import { isValidAddressValue, resolveAddress } from "../address/address.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import { getAtPath } from "../document/patch.ts";

/**
 * The generic performance write. Everything a show-control surface can move
 * goes through here: `address.set` with an Address and a value. OSC, Pads,
 * Macros and the CLI all end up in this command.
 */
export const addressSet = defineCommand({
  name: "address.set",
  kind: "performance",
  description: "Set the value at an Address, such as installation/blackout.",
  payload: z
    .object({ address: z.string().min(1), value: z.unknown() })
    .strict(),
  apply({ document, payload }) {
    const resolved = resolveAddress(document, payload.address);
    if (resolved === undefined)
      return rejected(`Unknown address “${payload.address}”.`);
    if (resolved.type === "trigger") {
      return rejected(
        `Address “${payload.address}” is a trigger; use address.trigger.`,
      );
    }
    if (!isValidAddressValue(resolved.type, payload.value)) {
      return rejected(
        `Address “${payload.address}” expects a ${resolved.type}.`,
      );
    }
    if (getAtPath(document, resolved.path) === payload.value)
      return accepted([]);
    return accepted([{ op: "set", path: resolved.path, value: payload.value }]);
  },
});

export const addressToggle = defineCommand({
  name: "address.toggle",
  kind: "performance",
  description: "Toggle a boolean Address.",
  payload: z.object({ address: z.string().min(1) }).strict(),
  apply({ document, payload }) {
    const resolved = resolveAddress(document, payload.address);
    if (resolved === undefined)
      return rejected(`Unknown address “${payload.address}”.`);
    if (resolved.type !== "boolean") {
      return rejected(`Address “${payload.address}” is not a boolean.`);
    }
    const current = getAtPath(document, resolved.path) === true;
    return accepted([{ op: "set", path: resolved.path, value: !current }]);
  },
});
