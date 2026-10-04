import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { rewriteUses, usesOf } from "../document/media-uses.ts";
import { parseMediaReference } from "../packs/reference.ts";

/**
 * Swaps one Media reference for another everywhere: every Layer Parameter
 * and every Macro set action holding `from` is set to `to`. Both must be
 * references of the same type: two Pack entries (`<pack>/<entry>`), or two
 * Screen Shares the Installation has. The shape is all that is checked;
 * whether the new entry exists is live status.
 */
export const mediaReplace = defineCommand({
  name: "media.replace",
  kind: "authoring",
  description:
    "Replace a Media reference everywhere it is used: every Layer Parameter and Macro action holding `from` is set to `to`; both are Pack entries (`<pack>/<entry>`) or both Screen Shares.",
  payload: z
    .object({ from: z.string().min(1), to: z.string().min(1) })
    .strict(),
  label: () => "Replace Media",
  apply({ document, payload, catalog }) {
    const { from, to } = payload;
    const fromEntry = parseMediaReference(from) !== undefined;
    const toEntry = parseMediaReference(to) !== undefined;
    if (fromEntry !== toEntry)
      return rejected(
        "Both references must be Pack entries (`<pack>/<entry>`), or both Screen Shares.",
      );
    if (!fromEntry) {
      for (const id of [from, to])
        if (!(id in document.shares))
          return rejected(
            `“${id}” is neither a Pack entry reference nor a Screen Share of the Installation.`,
          );
    }
    if (from === to) return accepted([]);
    const uses = usesOf(document, catalog, from);
    return accepted(rewriteUses(document, uses, to));
  },
});
