import type { DocumentView } from "@difracta/client";
import {
  generateId,
  orderedEntries,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { Monitor, MonitorUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useNow } from "@/lib/use-now";
import { useExpansion } from "@/navigator/expansion";
import { NavigatorEmptyRow, NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { NavigatorWarning } from "@/navigator/navigator-warning";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { isSelected, useSelection } from "@/selection/selection";

import {
  formatResolution,
  formatScale,
  presenceTone,
  sessionList,
  sessionStatus,
  toneClass,
  toneTitle,
  type SessionTable,
} from "./output-live";

/** Navigator section listing the Outputs; "+" asks for a name, creates one and selects it. */
export function OutputsSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { selection, select } = useSelection();
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const assigned = new Set(
    Object.values(surfaces).map((surface) => surface.output),
  );
  const [naming, setNaming] = useState(false);
  const ordered = orderedEntries(outputs);

  function create(name: string): void {
    const id = generateId("output");
    void command("output.create", { id, name }).then(() => {
      select({ kind: "output", id });
    });
  }

  return (
    <>
      <NavigatorSection
        storageKey="output"
        label="Outputs"
        empty={ordered.length === 0 ? "No Outputs yet." : undefined}
        onCreate={() => setNaming(true)}
      >
        <SortableList
          kind="output"
          ids={ordered.map((output) => output.id)}
          selectedId={selection?.kind === "output" ? selection.id : undefined}
          onMove={(id, after) =>
            void command("entity.move", { table: "outputs", id, after })
          }
        >
          {ordered.map((output) => (
            <SortableItem key={output.id} id={output.id}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <OutputRow
                    view={view}
                    output={output}
                    unassigned={!assigned.has(output.id)}
                    selected={isSelected(selection, "output", output.id)}
                    onSelect={() => select({ kind: "output", id: output.id })}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() =>
                      void command("output.remove", { outputId: output.id })
                    }
                  >
                    <Trash2 /> Remove
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </SortableItem>
          ))}
        </SortableList>
      </NavigatorSection>
      <NameDialog
        request={
          naming
            ? {
                title: "New Output",
                label: "Name",
                initial: `Output ${String(Object.keys(outputs).length + 1)}`,
                submitLabel: "Create",
                onSubmit: create,
              }
            : undefined
        }
        onClose={() => setNaming(false)}
      />
    </>
  );
}

/** The Output's row plus, while open, one row per Output Session under it. */
function OutputRow({
  view,
  output,
  unassigned,
  selected,
  onSelect,
}: {
  readonly view: DocumentView;
  readonly output: Output;
  /** No Surface renders through this Output. */
  readonly unassigned: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const sessions = sessionList(
    useDocumentPath<SessionTable>(view, [
      "live",
      "outputs",
      output.id,
      "sessions",
    ]),
  );
  const now = useNow(sessions.some((session) => session.stale));
  const { isExpanded, setExpanded } = useExpansion();
  const expanded = isExpanded("output", output.id);
  return (
    <>
      <NavigatorRow
        icon={MonitorUp}
        label={output.name}
        selected={selected}
        expanded={expanded}
        onToggle={(next) => setExpanded("output", output.id, next)}
        onSelect={onSelect}
      >
        {unassigned && (
          <NavigatorWarning
            label="No Surface"
            explanation="Nothing renders on this Output until a Surface is assigned to it."
          />
        )}
        <span
          className={`size-1.5 shrink-0 rounded-full ${toneClass[presenceTone(sessions)]}`}
          title={toneTitle(sessions)}
        />
      </NavigatorRow>
      {expanded && sessions.length === 0 && (
        <NavigatorEmptyRow depth={2}>Not connected</NavigatorEmptyRow>
      )}
      {expanded &&
        sessions.map((session) => (
          <NavigatorRow
            key={session.sessionId}
            icon={Monitor}
            depth={2}
            label={`${formatResolution(session)} ${formatScale(session)}`}
            selected={false}
            onSelect={onSelect}
          >
            <span className="font-mono text-[0.625rem] text-muted-foreground">
              {sessionStatus(session, now)}
            </span>
            <span
              className={`size-1.5 shrink-0 rounded-full ${toneClass[session.stale ? "stale" : "live"]}`}
              title={session.stale ? "Stopped reporting" : "Reporting"}
            />
          </NavigatorRow>
        ))}
    </>
  );
}
