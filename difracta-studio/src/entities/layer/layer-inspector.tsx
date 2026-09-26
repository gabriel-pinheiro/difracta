import type { DocumentView } from "@difracta/client";
import {
  generateId,
  effectiveValue,
  flattenControllers,
  layerAddresses,
  linkAt,
  linkable,
  orderedEntries,
  sameAddressValue,
  type AddressValue,
  type Controller,
  type Layer,
  type Link,
  type Media,
  type Region,
  type ResolvedAddress,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressRow, type RowLinks } from "@/inspector/fields/address-row";
import { FieldRow } from "@/inspector/fields/field-row";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { InspectorSection } from "@/inspector/fields/inspector-section";
import { NameField } from "@/inspector/fields/name-field";
import { catalog, definitionOf } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { DefinitionBlock } from "./definition-block";
import { PathRows } from "./path-rows";

/** The value an Address points at inside its Layer: the path minus `layers/<id>`. */
function valueAt(layer: Layer, resolved: ResolvedAddress): AddressValue {
  let current: unknown = layer;
  for (const segment of resolved.path.slice(2))
    current = (current as Record<string, unknown> | undefined)?.[segment];
  return current as AddressValue;
}

/**
 * What the Layer is made of and its name, then its settings and Parameters
 * as Address rows in two collapsible sections, and its Cues as buttons in a
 * third. Every row is one Address, so opacity and a Visual's Parameter are
 * edited through the same command and a Cue fires through the same Address
 * a Macro or OSC would. A row a Controller drives shows the Controller
 * instead of a control; the row menu links and unlinks. A Visual that
 * follows Paths gets one row per Path it declares, below the Target.
 */
export function LayerInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const layer = useDocumentPath<Layer>(view, ["layers", id]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const regions = useDocumentPath<Table<Region>>(view, ["regions"]) ?? {};
  // Each Surface followed by its Regions: both are Targets, one list.
  const targets = orderedEntries(surfaces).flatMap((surface) => [
    { value: surface.id, label: surface.name, region: false },
    ...orderedEntries(regions)
      .filter((region) => region.surfaceId === surface.id)
      .map((region) => ({
        value: region.id,
        label: `${surface.name} › ${region.name}`,
        region: true,
      })),
  ]);
  // A media Parameter lists the Media files of its type as its options.
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const links = useDocumentPath<Table<Link>>(view, ["links"]) ?? {};
  const controllers =
    useDocumentPath<Table<Controller>>(view, ["controllers"]) ?? {};
  const ordered = flattenControllers(controllers);

  useEffect(() => {
    if (layer === undefined) select({ kind: "installation" });
  }, [layer, select]);
  if (layer === undefined) return null;

  const addresses = layerAddresses(layer, catalog, media);
  const settings = addresses.filter(
    (entry) => !isParameter(entry) && !isCue(entry),
  );
  const parameters = addresses.filter(isParameter);
  const cues = addresses.filter(isCue);
  const definition =
    layer.kind === "group" ? undefined : definitionOf(layer).definition;
  const rowLinks = (resolved: ResolvedAddress): RowLinks => {
    const link = linkAt({ links }, resolved.address);
    const controller =
      link === undefined ? undefined : controllers[link.controllerId];
    const document = view.get();
    return {
      link,
      controller,
      effective:
        document === undefined
          ? valueAt(layer, resolved)
          : effectiveValue(document, resolved),
      candidates: ordered.filter(
        (candidate) =>
          candidate.kind !== "group" && linkable(resolved, candidate.kind),
      ),
      onLink: (controllerId) =>
        void command("link.create", {
          controllerId,
          addresses: [resolved.address],
        }),
      onCreate: (kind) => {
        const controllerId = generateId("controller");
        void command("controller.create", {
          id: controllerId,
          kind,
          name: `${layer.name} ${resolved.label}`,
          addresses: [resolved.address],
        }).then(() => select({ kind: "controller", id: controllerId }));
      },
      onUnlink: () => {
        if (link !== undefined)
          void command("link.remove", { linkId: link.id });
      },
      onOpen: (controllerId) =>
        select({ kind: "controller", id: controllerId }),
    };
  };
  const row = (resolved: ResolvedAddress) => (
    <AddressRow
      key={resolved.address}
      resolved={resolved}
      value={valueAt(layer, resolved)}
      description={definition?.parameters[parameterName(resolved)]?.description}
      onEdit={(value) =>
        command("address.edit", { address: resolved.address, value })
      }
      links={rowLinks(resolved)}
    />
  );
  const pathRows =
    layer.kind !== "visual" || definition?.kind !== "visual"
      ? []
      : [
          <PathRows
            key="paths"
            view={view}
            layer={layer}
            requirements={definition.paths ?? []}
          />,
        ];
  const allDefault = parameters.every(
    (entry) =>
      linkAt({ links }, entry.address) !== undefined ||
      sameAddressValue(valueAt(layer, entry), entry.default),
  );

  return (
    <>
      <InspectorHeading name={layer.name} id={layer.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
        {layer.kind !== "group" && <DefinitionBlock layer={layer} />}
        <NameField
          label="Name"
          value={layer.name}
          onCommit={(name) =>
            void command("layer.rename", { layerId: id, name })
          }
        />
      </div>
      <InspectorSection storageKey="layer" label="Layer">
        {settings.flatMap((resolved) =>
          resolved.address.endsWith("/opacity") && layer.kind === "visual"
            ? [
                <FieldRow key="target" label="Target">
                  <Select
                    value={layer.target}
                    items={[
                      { value: null, label: "None" },
                      ...targets.map(({ value, label }) => ({ value, label })),
                    ]}
                    onValueChange={(target: string | null) =>
                      void command("layer.update", { layerId: id, target })
                    }
                  >
                    <SelectTrigger aria-label="Target" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {targets.map((target) => (
                        <SelectItem key={target.value} value={target.value}>
                          <span className={target.region ? "pl-3" : undefined}>
                            {target.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>,
                ...pathRows,
                row(resolved),
              ]
            : [row(resolved)],
        )}
      </InspectorSection>
      {definition !== undefined && (
        <InspectorSection
          storageKey="parameters"
          label="Parameters"
          actions={
            <Button
              variant="ghost"
              size="xs"
              disabled={allDefault}
              onClick={() => void command("layer.reset", { layerId: id })}
            >
              Reset all
            </Button>
          }
        >
          {parameters.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              {definition.name} has no Parameters.
            </p>
          ) : (
            parameters.map(row)
          )}
        </InspectorSection>
      )}
      {cues.length > 0 && (
        <InspectorSection storageKey="cues" label="Cues">
          <div className="flex flex-wrap gap-1.5">
            {cues.map((resolved) => (
              <CueButton
                key={resolved.address}
                label={resolved.label}
                onFire={() =>
                  command("address.trigger", { address: resolved.address })
                }
              />
            ))}
          </div>
        </InspectorSection>
      )}
    </>
  );
}

/** Fires a Cue; lit for a moment afterwards so a press is seen without an Output. */
function CueButton({
  label,
  onFire,
}: {
  readonly label: string;
  readonly onFire: () => Promise<unknown>;
}) {
  const [lit, setLit] = useState(false);
  return (
    <Button
      variant="outline"
      size="xs"
      data-lit={lit || undefined}
      className="data-lit:border-selection data-lit:bg-selection/20"
      onClick={() => {
        setLit(true);
        window.setTimeout(() => setLit(false), 150);
        void onFire();
      }}
    >
      {label}
    </Button>
  );
}

const isParameter = (resolved: ResolvedAddress): boolean =>
  resolved.path[2] === "parameters";

const isCue = (resolved: ResolvedAddress): boolean =>
  resolved.type === "trigger";

const parameterName = (resolved: ResolvedAddress): string =>
  isParameter(resolved) ? (resolved.path[3] ?? "") : "";
