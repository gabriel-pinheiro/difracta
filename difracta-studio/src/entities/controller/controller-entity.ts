import type { EntityModule } from "@/entities";

import { ControllerInspector } from "./controller-inspector";
import { ControllersSection } from "./controllers-section";

export const controllerEntity: EntityModule = {
  label: "Controllers",
  Section: ControllersSection,
  Inspector: ControllerInspector,
  removal: {
    noun: "Controller",
    command: "controller.remove",
    payload: (id) => ({ controllerId: id }),
    find: (document, id) => document.controllers[id],
  },
};
