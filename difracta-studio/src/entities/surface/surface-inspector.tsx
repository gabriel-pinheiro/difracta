import type { DocumentView } from "@difracta/client";
import {
  orderedEntries,
  tableEntries,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect } from "react";

import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { SelectField } from "@/inspector/fields/select-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import {
  primarySession,
  sessionList,
  type SessionTable,
} from "@/entities/output/output-live";

import { QuadEditor } from "./quad-editor";

/** Frame shape assumed until an Output Session reports its real resolution. */
const DEFAULT_ASPECT = 16 / 9;

export function SurfaceInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const surface = useDocumentPath<Surface>(view, ["surfaces", id]);
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};

  useEffect(() => {
    if (surface === undefined) select({ kind: "installation" });
  }, [surface, select]);
  if (surface === undefined) return null;

  return (
    <>
      <InspectorHeading name={surface.name} id={surface.id} />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={surface.name}
          onCommit={(name) =>
            void command("surface.rename", { surfaceId: id, name })
          }
        />
        <SelectField
          label="Output"
          value={surface.output}
          noneLabel="None"
          options={orderedEntries(outputs).map((output) => ({
            value: output.id,
            label: output.name,
          }))}
          onValueChange={(output) =>
            void command("surface.assign", { surfaceId: id, output })
          }
        />
        {surface.output === null ? (
          <p className="text-[0.6875rem]/relaxed text-muted-foreground">
            Assign an Output to place this Surface in its frame.
          </p>
        ) : (
          <Mapping view={view} surface={surface} outputId={surface.output} />
        )}
      </div>
    </>
  );
}

/** Corner editing for the enabled mapping; other Surfaces on the Output give context. */
function Mapping({
  view,
  surface,
  outputId,
}: {
  readonly view: DocumentView;
  readonly surface: Surface;
  readonly outputId: string;
}) {
  const command = useCommand(view);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const sessions = useDocumentPath<SessionTable>(view, [
    "live",
    "outputs",
    outputId,
    "sessions",
  ]);
  const telemetry = primarySession(sessionList(sessions))?.telemetry;
  const aspect =
    telemetry === undefined || telemetry === null
      ? DEFAULT_ASPECT
      : telemetry.width / telemetry.height;
  const mapping = surface.mappings[outputId];
  if (mapping === undefined) return null;
  const others = tableEntries(surfaces).flatMap((other) => {
    const corners = other.mappings[outputId]?.corners;
    return other.id !== surface.id && other.output === outputId && corners
      ? [{ name: other.name, corners }]
      : [];
  });
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">Corners</span>
      <QuadEditor
        corners={mapping.corners}
        others={others}
        aspect={aspect}
        onSet={(corner, point) =>
          command("surface.corner.set", {
            surfaceId: surface.id,
            corner,
            point,
          })
        }
        onNudge={(corner, by) =>
          void command("surface.corner.nudge", {
            surfaceId: surface.id,
            corner,
            by,
          })
        }
      />
    </div>
  );
}
