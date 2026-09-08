import type { EntityModule } from "@/entities";

import { MaskInspector } from "./mask-inspector";

/** Masks have no section of their own: their rows sit under their Surface. */
export const maskEntity: EntityModule = {
  label: "Masks",
  Inspector: MaskInspector,
};
