import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import { dropActions } from "../document/macros.ts";
import { clearMediaValues } from "../document/media.ts";

/**
 * Removing a Media item clears it from every Media Parameter holding it, as
 * removing a Surface clears Targets, and drops the Macro set actions that
 * would write it. The file on disk is not touched.
 */
export const mediaRemove = defineCommand({
  name: "media.remove",
  kind: "authoring",
  description:
    "Remove a Media item; Parameters holding it are cleared and Macro actions setting it go. The file stays on disk.",
  payload: z.object({ mediaId: z.string().min(1) }).strict(),
  label: () => "Remove Media",
  apply({ document, payload, catalog }) {
    if (!(payload.mediaId in document.media))
      return rejected(`Media “${payload.mediaId}” does not exist.`);
    return accepted([
      ...clearMediaValues(
        document,
        catalog,
        (_accepts, value) => value === payload.mediaId,
      ),
      ...dropActions(
        document,
        (action) =>
          action.kind !== "set" ||
          action.value !== payload.mediaId ||
          resolveAddress(document, action.address, catalog)?.type !== "media",
      ),
      { op: "remove", path: ["media", payload.mediaId] },
    ]);
  },
});
