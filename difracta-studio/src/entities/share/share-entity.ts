import type { EntityModule } from "@/entities";

import { ShareInspector } from "./share-inspector";

/** Screen Shares have no section of their own: their rows sit in the Media section, after the Packs. */
export const shareEntity: EntityModule = {
  label: "Screen Shares",
  Inspector: ShareInspector,
  removal: {
    noun: "Screen Share",
    command: "share.remove",
    payload: (id) => ({ shareId: id }),
    find: (document, id) => document.shares[id],
  },
};
