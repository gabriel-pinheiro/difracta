import type { DocumentView } from "@difracta/client";
import {
  surfaceChildren,
  surfaceAddresses,
  type Mask,
  type Path,
  type Region,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect } from "react";

import { AddressRow } from "@/inspector/fields/address-row";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { childBadge, childKinds } from "./child-rows";
import { SizeField } from "./size-field";
import { SurfaceOutputs } from "./surface-outputs";

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
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]) ?? {};
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};

  useEffect(() => {
    if (surface === undefined) select({ kind: "installation" });
  }, [surface, select]);
  if (surface === undefined) return null;
  const children = surfaceChildren({ regions, masks, paths }, id);

  return (
    <>
      <InspectorHeading name={surface.name} id={surface.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={surface.name}
          onCommit={(name) =>
            void command("surface.rename", { surfaceId: id, name })
          }
        />
        <SurfaceOutputs view={view} surface={surface} />
        <Rendering view={view} surface={surface} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <span className="text-xs text-muted-foreground">
            Regions, Masks and Paths
          </span>
          {children.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Regions to target parts of it, no Masks, so the whole Surface
              is lit, and no Paths. Add any from the Surface's row in the
              navigator.
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
              {children.map((child) => {
                const { kind, icon: Icon } = childKinds[child.table];
                const badge = childBadge(child);
                return (
                  <li key={child.entity.id}>
                    <button
                      type="button"
                      className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        select({ kind, id: child.entity.id });
                      }}
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{child.entity.name}</span>
                      {badge !== undefined && (
                        <span className="ml-auto text-[0.625rem] text-muted-foreground">
                          {badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
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
