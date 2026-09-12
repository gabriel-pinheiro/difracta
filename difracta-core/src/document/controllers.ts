import type { Controller, ControllerKind, Table } from "./document.ts";
import { childrenOf, descendantsOf, flattenTree } from "./tree.ts";

export const CONTROLLER_LABELS: Record<ControllerKind, string> = {
  number: "Number Controller",
  color: "Color Controller",
  group: "Group",
};

/** The Controllers directly under the root (`parentId` null) or a Group, in order. */
export const childControllers = (
  controllers: Table<Controller>,
  parentId: string | null,
): readonly Controller[] => childrenOf(controllers, parentId);

/** Every Controller in navigator order: depth first from the root. */
export const flattenControllers = (
  controllers: Table<Controller>,
): readonly Controller[] => flattenTree(controllers);

/** Every Controller below `controllerId`, depth first in display order; empty unless it is a Group. */
export const descendantControllers = (
  controllers: Table<Controller>,
  controllerId: string,
): readonly Controller[] => descendantsOf(controllers, controllerId);
