import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { PackAttachment } from "../document/document.ts";
import { normalizeMediaPath } from "../document/media.ts";
import { BUNDLED_PACK_ID, SLUG_PATTERN } from "../packs/ids.ts";

/** The refusal for the Bundled Pack where an attached Pack is expected. */
export const BUNDLED_NEVER_IN_TABLE =
  "The Bundled Pack is attached to every Installation and is never attached, detached or renamed.";

/**
 * Attaches a Pack to the Installation by id, with a copy of its name and,
 * when the Pack sits inside or beside the Installation's folder, the
 * relative path to it as a hint (POSIX, `..` allowed), so the show folder
 * opens elsewhere with no Registry. The runtime's `packs.add` runs this
 * after scanning a folder; attaching a known Pack runs it alone. Attaching
 * a Pack already attached is refused; `packs.rename` changes its name.
 */
export const packsAttach = defineCommand({
  name: "packs.attach",
  kind: "authoring",
  description:
    "Attach a Pack to the Installation by id, with its name and, when it sits inside or beside the Installation's folder, the relative path to it; the Bundled Pack is always attached.",
  payload: z
    .object({
      packId: z.string().regex(SLUG_PATTERN),
      name: z.string().trim().min(1).max(120),
      relativePath: z.string().trim().min(1).optional(),
    })
    .strict(),
  label: ({ name }) => `Attach Pack “${name}”`,
  apply({ document, payload }) {
    if (payload.packId === BUNDLED_PACK_ID)
      return rejected(BUNDLED_NEVER_IN_TABLE);
    if (payload.packId in document.packs)
      return rejected(`Pack “${payload.packId}” is already attached.`);
    const relativePath =
      payload.relativePath === undefined
        ? undefined
        : normalizeMediaPath(payload.relativePath);
    const attachment: PackAttachment = {
      id: payload.packId,
      name: payload.name,
      ...(relativePath === undefined ? {} : { relativePath }),
    };
    return accepted([
      { op: "set", path: ["packs", payload.packId], value: attachment },
    ]);
  },
});
