import type { DocumentView } from "@difracta/client";
import {
  actionProblem,
  resolveAddress,
  type Macro,
  type MacroAction,
} from "@difracta/core";
import { Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { InspectorSection } from "@/inspector/fields/inspector-section";
import { NameField } from "@/inspector/fields/name-field";
import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath, useSignal } from "@/lib/client";
import { SortableItem, SortableList } from "@/navigator/sortable";
import { useSelection } from "@/selection/selection";

import { ActionPicker } from "./action-picker";
import { ActionRow } from "./action-row";
import { useRunMacro } from "./run-macro";

/**
 * A Macro's name, a Run button, and its actions in the order they run:
 * each with its target and value, draggable to reorder, marked when it
 * would be skipped, and a picker that adds many at once.
 */
export function MacroInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const run = useRunMacro(view);
  const { select } = useSelection();
  const macro = useDocumentPath<Macro>(view, ["macros", id]);
  // Actions read the whole document: their targets are anywhere in it.
  const document = useSignal(view.document);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (macro === undefined) select({ kind: "installation" });
  }, [macro, select]);
  if (macro === undefined || document === undefined) return null;

  const describe = (action: MacroAction) => ({
    resolved: resolveAddress(document, action.address, catalog),
    problem: actionProblem(document, catalog, action),
  });

  return (
    <>
      <InspectorHeading name={macro.name} id={macro.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
        <NameField
          label="Name"
          value={macro.name}
          onCommit={(name) =>
            void command("macro.rename", { macroId: id, name })
          }
        />
        {macro.kind === "macro" && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => run(macro)}
          >
            <Play /> Run
          </Button>
        )}
      </div>
      {macro.kind === "macro" && (
        <InspectorSection
          storageKey="actions"
          label="Actions"
          actions={
            <Button variant="ghost" size="xs" onClick={() => setPicking(true)}>
              <Plus /> Add action…
            </Button>
          }
        >
          {macro.actions.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              {macro.name} does nothing yet. Add actions: each sets, toggles or
              fires one Address, in this order.
            </p>
          ) : (
            <SortableList
              kind="macro-action"
              listId={`macro-action:${macro.id}`}
              ids={macro.actions.map((action) => action.id)}
              selectedId={undefined}
              onMove={(actionId, after) =>
                void command("macro.action.move", {
                  macroId: macro.id,
                  actionId,
                  after,
                })
              }
            >
              <div
                className="grid grid-cols-[minmax(0,1fr)] gap-px"
                role="list"
                aria-label="Actions"
              >
                {macro.actions.map((action) => {
                  const { resolved, problem } = describe(action);
                  return (
                    <SortableItem key={action.id} id={action.id}>
                      <ActionRow
                        action={action}
                        resolved={resolved}
                        problem={problem}
                        onValue={(value) =>
                          command("macro.action.update", {
                            macroId: macro.id,
                            actionId: action.id,
                            value,
                          })
                        }
                        onKind={(kind) =>
                          void command("macro.action.update", {
                            macroId: macro.id,
                            actionId: action.id,
                            kind,
                          })
                        }
                        onRemove={() =>
                          void command("macro.action.remove", {
                            macroId: macro.id,
                            actionId: action.id,
                          })
                        }
                      />
                    </SortableItem>
                  );
                })}
              </div>
            </SortableList>
          )}
        </InspectorSection>
      )}
      {picking && macro.kind === "macro" && (
        <ActionPicker
          view={view}
          macro={macro}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
