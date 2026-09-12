import { z } from "zod";

import { toggleAddress, writeAddress } from "../address/write.ts";
import {
  accepted,
  defineCommand,
  rejected,
  type CommandOutcome,
} from "../command/command.ts";
import type { Written } from "../address/write.ts";

export function outcomeOf(written: Written): CommandOutcome {
  return written.ok ? accepted(written.patches) : rejected(written.error);
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
  apply({ document, catalog, payload }) {
    return outcomeOf(
      writeAddress(document, catalog, payload.address, payload.value),
    );
  },
});

export const addressToggle = defineCommand({
  name: "address.toggle",
  kind: "performance",
  description: "Toggle a boolean Address.",
  payload: z.object({ address: z.string().min(1) }).strict(),
  apply({ document, catalog, payload }) {
    return outcomeOf(toggleAddress(document, catalog, payload.address));
  },
});
