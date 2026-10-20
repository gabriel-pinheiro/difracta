import type { EntityModule } from "@/entities";

import { SliceInspector } from "./slice-inspector";
import { sliceParent } from "./slice-parent";

/** Slices have no section of their own: their rows sit under their Output, after its Output Masks. */
export const sliceEntity: EntityModule = {
  label: "Slices",
  Inspector: SliceInspector,
  removal: {
    noun: "Slice",
    command: "slice.remove",
    payload: (id) => ({ sliceId: id }),
    find: (document, id) => document.slices[id],
  },
  parent: sliceParent,
};
