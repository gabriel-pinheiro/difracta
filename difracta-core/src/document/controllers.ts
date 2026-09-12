import type { Controller, ControllerKind, Table } from "./document.ts";
import { orderedEntries } from "./order.ts";

export const CONTROLLER_LABELS: Record<ControllerKind, string> = {
  number: "Number Controller",
  color: "Color Controller",
  group: "Group",
};

/** The Controllers directly under the root (`parentId` null) or a Group, in order. */
export function childControllers(
  controllers: Table<Controller>,
  parentId: string | null,
): readonly Controller[] {
  return orderedEntries(controllers).filter(
    (controller) => controller.parentId === parentId,
  );
}

/** Every Controller in navigator order: depth first from the root. */
export function flattenControllers(
  controllers: Table<Controller>,
): readonly Controller[] {
  const result: Controller[] = [];
  const visit = (parentId: string | null): void => {
    for (const child of childControllers(controllers, parentId)) {
      result.push(child);
      if (child.kind === "group") visit(child.id);
    }
  };
  visit(null);
  return result;
}

/** Every Controller below `controllerId`, depth first in display order; empty unless it is a Group. */
export function descendantControllers(
  controllers: Table<Controller>,
  controllerId: string,
): readonly Controller[] {
  const root = controllers[controllerId];
  if (root?.kind !== "group") return [];
  const result: Controller[] = [];
  const visit = (parent: Controller): void => {
    for (const child of childControllers(controllers, parent.id)) {
      result.push(child);
      if (child.kind === "group") visit(child);
    }
  };
  visit(root);
  return result;
}
