import type { DocumentView } from "@difracta/client";

import { PanelHeader } from "@/components/panel-header";
import { entities } from "@/entities";
import { InstallationInspector } from "@/entities/installation/installation-inspector";
import { useSelection } from "@/selection/selection";

/** Settings of whatever is selected in the navigator. */
export function Inspector({ view }: { readonly view: DocumentView }) {
  const { selection } = useSelection();
  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <PanelHeader>Inspector</PanelHeader>
      <div className="min-h-0 overflow-auto">
        {selection === undefined ? (
          <p className="p-3 text-muted-foreground">
            Nothing selected. Click an item in the navigator to see its settings
            here.
          </p>
        ) : selection.kind === "installation" ? (
          <InstallationInspector view={view} />
        ) : (
          <EntityInspector
            view={view}
            kind={selection.kind}
            id={selection.id}
          />
        )}
      </div>
    </aside>
  );
}

function EntityInspector({
  view,
  kind,
  id,
}: {
  readonly view: DocumentView;
  readonly kind: keyof typeof entities;
  readonly id: string;
}) {
  const { Inspector: Component } = entities[kind];
  return <Component key={`${kind}:${id}`} view={view} id={id} />;
}
