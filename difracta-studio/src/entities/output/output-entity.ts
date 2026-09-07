import type { EntityModule } from "@/entities";

import { OutputInspector } from "./output-inspector";
import { OutputsSection } from "./outputs-section";

export const outputEntity: EntityModule = {
  label: "Outputs",
  Section: OutputsSection,
  Inspector: OutputInspector,
};
