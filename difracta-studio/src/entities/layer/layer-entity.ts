import type { EntityModule } from "@/entities";

import { LayerInspector } from "./layer-inspector";

/** Layers have no section of their own: their rows sit under their Scene. */
export const layerEntity: EntityModule = {
  label: "Layers",
  Inspector: LayerInspector,
};
