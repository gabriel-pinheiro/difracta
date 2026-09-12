import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { writeAddress } from "../address/write.ts";
import { defineCommand } from "../command/command.ts";
import { outcomeOf } from "./address.set.ts";

/**
 * The authoring write to an Address: what the inspector sends when a person
 * moves a slider or picks a color. It enters undo history, labelled by the
 * property, and coalesces per Address, so a drag undoes as one step.
 * `address.set` is the same write for show control, which never undoes.
 */
export const addressEdit = defineCommand({
  name: "address.edit",
  kind: "authoring",
  description:
    "Edit the value at an Address, such as layer/<id>/opacity, as an undoable step.",
  payload: z
    .object({ address: z.string().min(1), value: z.unknown() })
    .strict(),
  label: ({ address }, { document, catalog }) =>
    `Change ${resolveAddress(document, address, catalog)?.label ?? address}`,
  coalesceKey: ({ address }) => `address.edit:${address}`,
  apply({ document, catalog, payload }) {
    return outcomeOf(
      writeAddress(document, catalog, payload.address, payload.value),
    );
  },
});
