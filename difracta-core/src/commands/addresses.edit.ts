import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { writeAddress } from "../address/write.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Patch } from "../document/patch.ts";

const EditSchema = z
  .object({ address: z.string().min(1), value: z.unknown() })
  .strict();

/**
 * `address.edit` for several Addresses at once, as one undoable step: what
 * the inspector sends when one gesture moves several values together, such
 * as the Live Visual's crop rectangle dragged whole. Each write follows
 * `address.edit`'s rule, and one refusal refuses them all. It coalesces per
 * set of Addresses, so a drag undoes as one step.
 */
export const addressesEdit = defineCommand({
  name: "addresses.edit",
  kind: "authoring",
  description:
    "Edit the values at several Addresses as one undoable step, such as the four crops of a Live Layer.",
  payload: z
    .object({ edits: z.array(EditSchema).min(1) })
    .strict()
    .refine(
      ({ edits }) =>
        new Set(edits.map((edit) => edit.address)).size === edits.length,
      { message: "Each Address may be edited once." },
    ),
  label: ({ edits }, { document, catalog }) =>
    `Change ${listed(
      edits.map(
        ({ address }) =>
          resolveAddress(document, address, catalog)?.label ?? address,
      ),
    )}`,
  coalesceKey: ({ edits }) =>
    `addresses.edit:${edits
      .map((edit) => edit.address)
      .sort()
      .join(",")}`,
  apply({ document, catalog, payload }) {
    const patches: Patch[] = [];
    for (const { address, value } of payload.edits) {
      const written = writeAddress(document, catalog, address, value);
      if (!written.ok) return rejected(written.error);
      patches.push(...written.patches);
    }
    return accepted(patches);
  },
});

/** "A", "A and B", "A, B and C". */
function listed(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}
