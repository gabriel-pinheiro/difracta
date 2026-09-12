import type { DocumentView } from "@difracta/client";
import {
  CONTROLLER_KINDS,
  childControllers,
  type Controller,
  type ControllerKind,
  type Table,
} from "@difracta/core";
import { useState } from "react";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import type { CreateItem } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { useSelection } from "@/selection/selection";

import { ControllerRows } from "./controller-rows";
import { controllerIcons, controllerKindLabels } from "./controller-icons";

function generateControllerId(): string {
  return `controller_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/**
 * Navigator section listing the Controllers as a tree of Groups. Number and
 * Color Controllers are values Parameter Links spread over Layers; Groups
 * only arrange them. Creating asks for a name, since a Controller is named
 * for what it drives ("Energy", "Strobe Color") rather than numbered.
 */
export function ControllersSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const controllers =
    useDocumentPath<Table<Controller>>(view, ["controllers"]) ?? {};
  const [naming, setNaming] = useState<NameRequest | undefined>(undefined);
  const roots = childControllers(controllers, null);

  function requestCreate(kind: ControllerKind, parentId: string | null): void {
    const siblings = childControllers(controllers, parentId);
    setNaming({
      title: `New ${controllerKindLabels[kind]}`,
      label: "Name",
      initial: `${controllerKindLabels[kind]} ${String(siblings.length + 1)}`,
      submitLabel: "Create",
      onSubmit: (name) => {
        const id = generateControllerId();
        void command("controller.create", { id, kind, parentId, name }).then(
          () => {
            if (parentId !== null) setExpanded("controller", parentId, true);
            select({ kind: "controller", id });
          },
        );
      },
    });
  }

  const createItems = (parentId: string | null): readonly CreateItem[] =>
    CONTROLLER_KINDS.map((kind) => ({
      label: controllerKindLabels[kind],
      icon: controllerIcons[kind],
      onSelect: () => requestCreate(kind, parentId),
    }));

  return (
    <>
      <NavigatorSection
        storageKey="controller"
        label="Controllers"
        empty={
          roots.length === 0 ? "No Controllers. Press + to add one." : undefined
        }
        createItems={createItems(null)}
      >
        <ControllerRows
          view={view}
          parentId={null}
          depth={1}
          createItems={createItems}
        />
      </NavigatorSection>
      <NameDialog request={naming} onClose={() => setNaming(undefined)} />
    </>
  );
}
