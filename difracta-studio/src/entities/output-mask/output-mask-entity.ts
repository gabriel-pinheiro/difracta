import type { EntityModule } from "@/entities";

import { OutputMaskInspector } from "./output-mask-inspector";
import { outputMaskParent } from "./output-mask-parent";

/** Output Masks have no section of their own: their rows sit under their Output. */
export const outputMaskEntity: EntityModule = {
  label: "Output Masks",
  Inspector: OutputMaskInspector,
  removal: {
    noun: "Output Mask",
    command: "output-mask.remove",
    payload: (id) => ({ outputMaskId: id }),
    find: (document, id) => document.outputMasks[id],
  },
  parent: outputMaskParent,
};
