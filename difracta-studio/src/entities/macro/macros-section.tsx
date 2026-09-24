import type { DocumentView } from "@difracta/client";
import {
  generateId,
  MACRO_KINDS,
  childMacros,
  type Macro,
  type MacroKind,
  type Table,
} from "@difracta/core";
import { useState } from "react";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import type { CreateItem } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { useSelection } from "@/selection/selection";

import { MacroRows } from "./macro-rows";
import { macroIcons, macroKindLabels } from "./macro-icons";

/**
 * Navigator section listing the Macros as a tree of Groups, each Macro with
 * a Run button. Creating asks for a name, since a Macro is named for what
 * it does ("Strobe On", "Look · Ice"). The section starts collapsed unless
 * it is empty, where the empty row is the whole content.
 */
export function MacrosSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const table = useDocumentPath<Table<Macro>>(view, ["macros"]);
  const macros = table ?? {};
  const [naming, setNaming] = useState<NameRequest | undefined>(undefined);
  const roots = childMacros(macros, null);
  // The default open state depends on the Installation, so wait for it.
  if (table === undefined) return null;

  function requestCreate(kind: MacroKind, parentId: string | null): void {
    const siblings = childMacros(macros, parentId);
    setNaming({
      title: `New ${macroKindLabels[kind]}`,
      label: "Name",
      initial: `${macroKindLabels[kind]} ${String(siblings.length + 1)}`,
      submitLabel: "Create",
      onSubmit: (name) => {
        const id = generateId("macro");
        void command("macro.create", { id, kind, parentId, name }).then(() => {
          if (parentId !== null) setExpanded("macro", parentId, true);
          select({ kind: "macro", id });
        });
      },
    });
  }

  const createItems = (parentId: string | null): readonly CreateItem[] =>
    MACRO_KINDS.map((kind) => ({
      label: macroKindLabels[kind],
      icon: macroIcons[kind],
      onSelect: () => requestCreate(kind, parentId),
    }));

  return (
    <>
      <NavigatorSection
        storageKey="macro"
        holds={["macro"]}
        label="Macros"
        defaultExpanded={roots.length === 0}
        empty={roots.length === 0 ? "No Macros yet." : undefined}
        createItems={createItems(null)}
      >
        <MacroRows
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
