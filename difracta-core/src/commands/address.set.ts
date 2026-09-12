import { z } from "zod";

import {
  addressValueProblem,
  resolveAddress,
  sameAddressValue,
  type ResolvedAddress,
} from "../address/address.ts";
import { linkAt } from "../address/links.ts";
import {
  accepted,
  defineCommand,
  rejected,
  type CommandContext,
  type CommandOutcome,
} from "../command/command.ts";
import { getAtPath } from "../document/patch.ts";

/**
 * Writing a value to an Address, shared by the performance write here and
 * the authoring `address.edit`: the Address must exist, be settable and
 * accept the value. Writing what is already there changes nothing.
 */
export function writeAddress(
  { document, catalog }: CommandContext<unknown>,
  address: string,
  value: unknown,
): CommandOutcome & { readonly resolved?: ResolvedAddress } {
  const resolved = resolveAddress(document, address, catalog);
  if (resolved === undefined) return rejected(`Unknown address “${address}”.`);
  if (resolved.type === "trigger")
    return rejected(`Address “${address}” is a trigger; use address.trigger.`);
  const link = linkAt(document, address);
  if (link !== undefined)
    return rejected(
      `${resolved.label} is controlled by ${document.controllers[link.controllerId]?.name ?? "a Controller"}.`,
    );
  const problem = addressValueProblem(resolved, value);
  if (problem !== undefined)
    return rejected(`Address “${address}” ${problem}.`);
  if (sameAddressValue(getAtPath(document, resolved.path), value))
    return { ...accepted([]), resolved };
  return {
    ...accepted([{ op: "set", path: resolved.path, value }]),
    resolved,
  };
}

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
  apply(context) {
    return writeAddress(
      context,
      context.payload.address,
      context.payload.value,
    );
  },
});

export const addressToggle = defineCommand({
  name: "address.toggle",
  kind: "performance",
  description: "Toggle a boolean Address.",
  payload: z.object({ address: z.string().min(1) }).strict(),
  apply({ document, payload, catalog }) {
    const resolved = resolveAddress(document, payload.address, catalog);
    if (resolved === undefined)
      return rejected(`Unknown address “${payload.address}”.`);
    if (resolved.type !== "boolean") {
      return rejected(`Address “${payload.address}” is not a boolean.`);
    }
    const current = getAtPath(document, resolved.path) === true;
    return accepted([{ op: "set", path: resolved.path, value: !current }]);
  },
});
