import type { DocumentView } from "@difracta/client";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Theater } from "lucide-react";
import { useEffect, useRef } from "react";

import { PanelHeader } from "@/components/panel-header";
import { entities, entityKinds } from "@/entities";
import { useDocumentPath } from "@/lib/client";
import { deselectOnBackgroundClick, useSelection } from "@/selection/selection";

import { NavigatorRow } from "./navigator-row";

/** Everything in the Installation: its root row, then one section per entity kind. */
export function Navigator({ view }: { readonly view: DocumentView }) {
  const { selection, select } = useSelection();
  const name = useDocumentPath<string>(view, ["installation", "name"]) ?? "";
  const scroller = useRef<HTMLDivElement>(null);
  // Dragging a row near the top or bottom scrolls the list.
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    return autoScrollForElements({ element });
  }, []);
  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
      onClick={deselectOnBackgroundClick(select)}
    >
      <PanelHeader>Navigator</PanelHeader>
      <div
        ref={scroller}
        className="grid flex-1 content-start gap-1 overflow-auto p-1"
      >
        <NavigatorRow
          icon={Theater}
          label={name}
          depth={0}
          selected={selection?.kind === "installation"}
          onSelect={() => select({ kind: "installation" })}
        />
        {entityKinds.map((kind) => {
          const { Section } = entities[kind];
          return Section === undefined ? null : (
            <Section key={kind} view={view} />
          );
        })}
      </div>
    </aside>
  );
}
