import type { DocumentView } from "@difracta/client";
import { Box } from "lucide-react";

import { PanelHeader } from "@/components/panel-header";
import { entities, entityKinds } from "@/entities";
import { useDocumentPath } from "@/lib/client";
import { deselectOnBackgroundClick, useSelection } from "@/selection/selection";

import { NavigatorRow } from "./navigator-row";

/** Everything in the Installation: its root row, then one section per entity kind. */
export function Navigator({ view }: { readonly view: DocumentView }) {
  const { selection, select } = useSelection();
  const name = useDocumentPath<string>(view, ["installation", "name"]) ?? "";
  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      onClick={deselectOnBackgroundClick(select)}
    >
      <PanelHeader>Navigator</PanelHeader>
      <div className="grid flex-1 content-start gap-1 overflow-auto p-1">
        <NavigatorRow
          icon={Box}
          label={name}
          depth={0}
          selected={selection?.kind === "installation"}
          onSelect={() => select({ kind: "installation" })}
        />
        {entityKinds.map((kind) => {
          const { Section } = entities[kind];
          return <Section key={kind} view={view} />;
        })}
      </div>
    </aside>
  );
}
