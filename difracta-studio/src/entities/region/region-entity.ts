import type { EntityModule } from "@/entities";
import { surfaceChildParent } from "@/entities/surface/surface-child-parent";

import { RegionInspector } from "./region-inspector";

/** Regions have no section of their own: their rows sit under their Surface. */
export const regionEntity: EntityModule = {
  label: "Regions",
  Inspector: RegionInspector,
  removal: {
    noun: "Region",
    command: "region.remove",
    payload: (id) => ({ regionId: id }),
    find: (document, id) => document.regions[id],
  },
  parent: surfaceChildParent("regions"),
};
