import type { DocumentView } from "@difracta/client";
import { orderedEntries, type Output, type Table } from "@difracta/core";
import { Monitor, MonitorUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { NameDialog } from "@/components/name-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useClient, useDocumentPath } from "@/lib/client";
import { useNow } from "@/lib/use-now";
import { NavigatorRow } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
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

function generateOutputId(): string {
  return `output_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** Navigator section listing the Outputs; "+" asks for a name, creates one and selects it. */
export function OutputsSection({ view }: { readonly view: DocumentView }) {
  const client = useClient();
  const { selection, select } = useSelection();
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const [naming, setNaming] = useState(false);
  const ordered = orderedEntries(outputs);

  function run(name: string, payload: unknown): Promise<unknown> {
    return client
      .command(view.documentId, name, payload)
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
  }

  function create(name: string): void {
    const id = generateOutputId();
    void run("output.create", { id, name }).then(() => {
      select({ kind: "output", id });
    });
  }

  return (
    <>
      <NavigatorSection
        storageKey="output"
        label="Outputs"
        onCreate={() => setNaming(true)}
      >
        <SortableList
          kind="output"
          ids={ordered.map((output) => output.id)}
          selectedId={selection?.kind === "output" ? selection.id : undefined}
          onMove={(id, after) =>
            void run("entity.move", { table: "outputs", id, after })
          }
        >
          {ordered.map((output) => (
            <SortableItem key={output.id} id={output.id}>
              <ContextMenu>
                <ContextMenuTrigger>
                  <OutputRow
                    view={view}
                    output={output}
                    selected={isSelected(selection, "output", output.id)}
                    onSelect={() => select({ kind: "output", id: output.id })}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() =>
                      void run("output.remove", { outputId: output.id })
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

/** The Output's row plus one row per Output Session under it. */
function OutputRow({
  view,
  output,
  selected,
  onSelect,
}: {
  readonly view: DocumentView;
  readonly output: Output;
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
  return (
    <>
      <NavigatorRow
        icon={MonitorUp}
        label={output.name}
        selected={selected}
        onSelect={onSelect}
      >
        <span
          className={`size-1.5 shrink-0 rounded-full ${toneClass[presenceTone(sessions)]}`}
          title={toneTitle(sessions)}
        />
      </NavigatorRow>
      {sessions.map((session) => (
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
