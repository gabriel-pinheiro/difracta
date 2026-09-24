import type { EntityModule } from "@/entities";

import { SceneInspector } from "./scene-inspector";
import { ScenesSection } from "./scenes-section";

export const sceneEntity: EntityModule = {
  label: "Scenes",
  Section: ScenesSection,
  Inspector: SceneInspector,
  removal: {
    noun: "Scene",
    command: "scene.remove",
    payload: (id) => ({ sceneId: id }),
    find: (document, id) => document.scenes[id],
    refusal: (document, id) =>
      document.installation.activeScene === id
        ? "Active Scene: play another first"
        : undefined,
  },
};
