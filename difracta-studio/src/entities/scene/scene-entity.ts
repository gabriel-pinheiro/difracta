import type { EntityModule } from "@/entities";

import { SceneInspector } from "./scene-inspector";
import { ScenesSection } from "./scenes-section";

export const sceneEntity: EntityModule = {
  label: "Scenes",
  Section: ScenesSection,
  Inspector: SceneInspector,
};
