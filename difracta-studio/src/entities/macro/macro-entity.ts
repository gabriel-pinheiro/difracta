import type { EntityModule } from "@/entities";
import { groupParent } from "@/navigator/ancestor-rows";

import { MacroInspector } from "./macro-inspector";
import { MacrosSection } from "./macros-section";

export const macroEntity: EntityModule = {
  label: "Macros",
  Section: MacrosSection,
  Inspector: MacroInspector,
  removal: {
    noun: "Macro",
    command: "macro.remove",
    payload: (id) => ({ macroId: id }),
    find: (document, id) => document.macros[id],
  },
  parent: groupParent("macro", (document) => document.macros),
};
