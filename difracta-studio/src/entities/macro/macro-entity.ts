import type { EntityModule } from "@/entities";

import { MacroInspector } from "./macro-inspector";
import { MacrosSection } from "./macros-section";

export const macroEntity: EntityModule = {
  label: "Macros",
  Section: MacrosSection,
  Inspector: MacroInspector,
};
