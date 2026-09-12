import type { EntityModule } from "@/entities";

import { PathInspector } from "./path-inspector";

/** Paths have no section of their own: their rows sit under their Surface, among its Masks. */
export const pathEntity: EntityModule = {
  label: "Paths",
  Inspector: PathInspector,
};
