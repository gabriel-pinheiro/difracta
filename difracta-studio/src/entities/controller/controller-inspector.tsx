import type { DocumentView } from "@difracta/client";
import {
  addressSource,
  controllerAddress,
  resolveAddress,
  type Controller,
  type Layer,
  type Link,
  type NumberRange,
  type Scene,
  type Table,
} from "@difracta/core";
import { Link2Off, Plus } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, parseNumber } from "@/inspector/fields/address-format";
import { AddressRow } from "@/inspector/fields/address-row";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { InspectorSection } from "@/inspector/fields/inspector-section";
import { NameField } from "@/inspector/fields/name-field";
import { catalog } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { LinkPicker } from "./link-picker";

/**
 * A Controller's name, its value as the same row a Parameter gets, and the
 * Links it drives: each target with its Layer and Scene, a number Link's
 * mapping editable in place, unlink, and a picker to add many at once.
 */
export function ControllerInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const controller = useDocumentPath<Controller>(view, ["controllers", id]);
  const links = useDocumentPath<Table<Link>>(view, ["links"]) ?? {};
  const layers = useDocumentPath<Table<Layer>>(view, ["layers"]) ?? {};
  const scenes = useDocumentPath<Table<Scene>>(view, ["scenes"]) ?? {};
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (controller === undefined) select({ kind: "installation" });
  }, [controller, select]);
  if (controller === undefined) return null;
  const resolved = controllerAddress(controller);
  const own = Object.values(links)
    .filter((link) => link.controllerId === id)
    .map((link) => ({ link, target: describeTarget(link, layers, scenes) }))
    .sort((a, b) => a.target.text.localeCompare(b.target.text));

  return (
    <>
      <InspectorHeading name={controller.name} id={controller.id} />
      <div className="grid gap-3 p-3">
        <NameField
          label="Name"
          value={controller.name}
          onCommit={(name) =>
            void command("controller.rename", { controllerId: id, name })
          }
        />
        {resolved !== undefined && controller.kind !== "group" && (
          <AddressRow
            resolved={resolved}
            value={controller.value}
            onEdit={(value) =>
              command("address.edit", { address: resolved.address, value })
            }
          />
        )}
      </div>
      {controller.kind !== "group" && (
        <InspectorSection
          storageKey="links"
          label="Links"
          actions={
            <Button variant="ghost" size="xs" onClick={() => setPicking(true)}>
              <Plus /> Add link…
            </Button>
          }
        >
          {own.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              Nothing is controlled by {controller.name} yet. Add links here, or
              from a Parameter row's link menu.
            </p>
          ) : (
            <ul className="grid gap-1" aria-label="Links">
              {own.map(({ link, target }) => (
                <li
                  key={link.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5"
                >
                  <button
                    type="button"
                    className="min-w-0 truncate text-left text-xs hover:text-foreground"
                    title={`${target.text}${target.scene === undefined ? "" : ` in ${target.scene}`}`}
                    disabled={target.layerId === undefined}
                    onClick={() => {
                      if (target.layerId !== undefined)
                        select({ kind: "layer", id: target.layerId });
                    }}
                  >
                    <span className="text-muted-foreground">
                      {target.layer}
                    </span>{" "}
                    <span className="text-muted-foreground/60">·</span>{" "}
                    {target.label}
                  </button>
                  <div className="flex items-center gap-1">
                    {link.anchors !== null && target.range !== undefined && (
                      <>
                        <AnchorField
                          label={`${target.label} at 0%`}
                          value={link.anchors.from}
                          range={target.range}
                          onCommit={(from) =>
                            void command("link.update", {
                              linkId: link.id,
                              anchors: { from, to: link.anchors?.to ?? 0 },
                            })
                          }
                        />
                        <span className="text-[0.625rem] text-muted-foreground">
                          →
                        </span>
                        <AnchorField
                          label={`${target.label} at 100%`}
                          value={link.anchors.to}
                          range={target.range}
                          onCommit={(to) =>
                            void command("link.update", {
                              linkId: link.id,
                              anchors: { from: link.anchors?.from ?? 0, to },
                            })
                          }
                        />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Unlink ${target.text}`}
                      title="Unlink; the Parameter keeps its current value"
                      onClick={() =>
                        void command("link.remove", { linkId: link.id })
                      }
                    >
                      <Link2Off />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </InspectorSection>
      )}
      {picking && controller.kind !== "group" && (
        <LinkPicker
          view={view}
          controller={controller}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

interface Target {
  readonly text: string;
  readonly layer: string;
  readonly label: string;
  readonly scene?: string | undefined;
  readonly layerId?: string | undefined;
  readonly range?: NumberRange | undefined;
}

/** What a Link points at, in words: the Layer, the property, the Scene. A Link whose target is gone shows its Address. */
function describeTarget(
  link: Link,
  layers: Table<Layer>,
  scenes: Table<Scene>,
): Target {
  const resolved = resolveAddress(
    addressSource({ layers }),
    link.address,
    catalog,
  );
  const layerId = link.address.split("/")[1];
  const layer = layerId === undefined ? undefined : layers[layerId];
  if (resolved === undefined || layer === undefined)
    return { text: link.address, layer: link.address, label: "" };
  return {
    text: `${layer.name} · ${resolved.label}`,
    layer: layer.name,
    label: resolved.label,
    scene: scenes[layer.sceneId]?.name,
    layerId: layer.id,
    range: resolved.range,
  };
}

/** One anchor of a number Link: typed in the target's units, clamped to its range. */
function AnchorField({
  label,
  value,
  range,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly range: NumberRange;
  readonly onCommit: (value: number) => void;
}) {
  const shown = formatNumber(value, range);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const finish = (cancel: boolean): void => {
    if (!cancel && draft !== undefined) {
      const parsed = parseNumber(draft, range);
      if (parsed !== undefined && parsed !== value) onCommit(parsed);
    }
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") finish(false);
    else if (event.key === "Escape") finish(true);
    else return;
    event.preventDefault();
  };
  return (
    <Input
      aria-label={label}
      title={label}
      className="h-5 w-14 px-1 text-right text-[0.6875rem] tabular-nums"
      value={draft ?? shown}
      onFocus={() => setDraft(shown)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => finish(false)}
      onKeyDown={onKeyDown}
    />
  );
}
