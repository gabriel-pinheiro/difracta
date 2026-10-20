import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { outputSlices } from "../document/slices.ts";
import { sliceEditPatches } from "./slice-edits.ts";

/**
 * Removing a Slice unlinks the mappings following it, leaving each where it
 * was; removing an Output's last Slice unlinks every follower on the
 * Output, whole-frame ones included, since an unsliced Output has nothing
 * to follow.
 */
export const sliceRemove = defineCommand({
  name: "slice.remove",
  kind: "authoring",
  description:
    "Remove a Slice; mappings following it keep their place as corners.",
  payload: z.object({ sliceId: z.string().min(1) }).strict(),
  label: () => "Remove Slice",
  apply({ document, payload }) {
    const slice = document.slices[payload.sliceId];
    if (slice === undefined)
      return rejected(`Slice “${payload.sliceId}” does not exist.`);
    const last = outputSlices(document.slices, slice.outputId).length === 1;
    return accepted(
      sliceEditPatches(document, {
        outputId: slice.outputId,
        remove: [slice.id],
        unlinks: (follow) =>
          last || ("slice" in follow && follow.slice === slice.id),
      }),
    );
  },
});
