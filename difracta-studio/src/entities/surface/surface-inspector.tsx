import type { DocumentView } from "@difracta/client";
import {
  CORNERS,
  orderedEntries,
  surfaceChildren,
  surfaceAddresses,
  tableEntries,
  type Mask,
  type Path,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { Spline, SquareDashed } from "lucide-react";
import { useEffect, useState } from "react";

import { AddressRow } from "@/inspector/fields/address-row";
import { CalibrationControls } from "@/inspector/fields/calibration-controls";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { SelectField } from "@/inspector/fields/select-field";
import { calibrationFor, useCalibration } from "@/lib/calibration";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { useSelection } from "@/selection/selection";

import {
  primarySession,
  sessionList,
  type SessionTable,
} from "@/entities/output/output-live";

import { QuadEditor, quadPoints } from "./quad-editor";
import { SizeField } from "./size-field";

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
  const { setExpanded } = useExpansion();
  const surface = useDocumentPath<Surface>(view, ["surfaces", id]);
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};

  useEffect(() => {
    if (surface === undefined) select({ kind: "installation" });
  }, [surface, select]);
  if (surface === undefined) return null;
  const children = surfaceChildren({ masks, paths }, id);

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
          <div className="grid gap-2">
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              Assign an Output to place this Surface in its frame.
            </p>
            <CalibrationControls
              view={view}
              surfaceId={surface.id}
              maskId={null}
              corner={null}
              point={null}
              disabled
            />
          </div>
        ) : (
          <Mapping view={view} surface={surface} outputId={surface.output} />
        )}
        <Rendering view={view} surface={surface} />
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Masks and Paths</span>
          {children.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Masks, so the whole Surface is lit, and no Paths. Add either
              from the Surface's row in the navigator.
            </p>
          ) : (
            <ul className="grid gap-px">
              {children.map(({ table, entity }) => (
                <li key={entity.id}>
                  <button
                    type="button"
                    className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      // Selecting from here reveals the row in the navigator.
                      setExpanded("surface", id, true);
                      select({
                        kind: table === "masks" ? "mask" : "path",
                        id: entity.id,
                      });
                    }}
                  >
                    {table === "masks" ? (
                      <SquareDashed className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Spline className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{entity.name}</span>
                    {table === "masks" && entity.mode === "exclude" && (
                      <span className="ml-auto text-[0.625rem] text-muted-foreground">
                        exclude
                      </span>
                    )}
                    {table === "paths" && !entity.closed && (
                      <span className="ml-auto text-[0.625rem] text-muted-foreground">
                        open
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/** What Layers on this Surface render into: its real shape and the Render Scale. */
function Rendering({
  view,
  surface,
}: {
  readonly view: DocumentView;
  readonly surface: Surface;
}) {
  const command = useCommand(view);
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Rendering</span>
      <SizeField
        surface={surface}
        onCommit={(size) =>
          void command("surface.size", { surfaceId: surface.id, size })
        }
      />
      {surfaceAddresses(surface).map((resolved) => (
        <AddressRow
          key={resolved.address}
          resolved={resolved}
          value={surface.renderScale}
          onEdit={(value) =>
            command("address.edit", { address: resolved.address, value })
          }
        />
      ))}
    </div>
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
  const { calibration } = useCalibration(view);
  // Open on the corner the Output already highlights, if it does.
  const [selected, setSelected] = useState(() => {
    const corner = calibrationFor(calibration, surface.id, null)?.corner;
    return corner == null ? 0 : CORNERS.indexOf(corner);
  });
  const mapping = surface.mappings[outputId];
  if (mapping === undefined) return null;
  const others = tableEntries(surfaces).flatMap((other) => {
    const corners = other.mappings[outputId]?.corners;
    return other.id !== surface.id && other.output === outputId && corners
      ? [{ name: other.name, points: quadPoints(corners) }]
      : [];
  });
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">Corners</span>
      <QuadEditor
        corners={mapping.corners}
        others={others}
        aspect={aspect}
        selected={selected}
        onSelect={setSelected}
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
      <CalibrationControls
        view={view}
        surfaceId={surface.id}
        maskId={null}
        corner={CORNERS[selected] ?? "topLeft"}
        point={null}
      />
    </div>
  );
}
