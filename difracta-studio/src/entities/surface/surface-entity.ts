import type { EntityModule } from "@/entities";

import { SurfaceInspector } from "./surface-inspector";
import { SurfacesSection } from "./surfaces-section";

export const surfaceEntity: EntityModule = {
  label: "Surfaces",
  Section: SurfacesSection,
  Inspector: SurfaceInspector,
  removal: {
    noun: "Surface",
    command: "surface.remove",
    payload: (id) => ({ surfaceId: id }),
    find: (document, id) => document.surfaces[id],
  },
};
