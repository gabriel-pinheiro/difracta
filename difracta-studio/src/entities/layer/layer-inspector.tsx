import type { DocumentView } from "@difracta/client";
import {
  BLEND_MODES,
  orderedEntries,
  type BlendMode,
  type Layer,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect } from "react";

import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { NumberField } from "@/inspector/fields/number-field";
import { fromPercent, toPercent } from "@/inspector/fields/points";
import { SelectField } from "@/inspector/fields/select-field";
import { SwitchField } from "@/inspector/fields/switch-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { layerKindLabels } from "./layer-icons";

const blendLabels: Record<BlendMode, string> = {
  normal: "Normal",
  additive: "Additive",
};

/** Name, enabled and the fields of the Layer's kind; the Visual or Filter itself is picked elsewhere. */
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
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};

  useEffect(() => {
    if (layer === undefined) select({ kind: "installation" });
  }, [layer, select]);
  if (layer === undefined) return null;
  const percent = (value: number): number =>
    Math.min(1, Math.max(0, fromPercent(value)));

  return (
    <>
      <InspectorHeading name={layer.name} id={layer.id} />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={layer.name}
          onCommit={(name) =>
            void command("layer.rename", { layerId: id, name })
          }
        />
        <SwitchField
          label="Enabled"
          description={`A disabled ${layerKindLabels[layer.kind]} ${
            layer.kind === "group"
              ? "hides everything inside it."
              : layer.kind === "filter"
                ? "leaves the frame below it untouched."
                : "renders nothing."
          }`}
          checked={layer.enabled}
          onCheckedChange={(enabled) =>
            void command("layer.update", { layerId: id, enabled })
          }
        />
        {layer.kind === "visual" && (
          <>
            <SelectField
              label="Target"
              value={layer.target}
              noneLabel="None"
              options={orderedEntries(surfaces).map((surface) => ({
                value: surface.id,
                label:
                  surface.output === null
                    ? `${surface.name} (no Output)`
                    : `${surface.name} on ${outputs[surface.output]?.name ?? surface.output}`,
              }))}
              onValueChange={(target) =>
                void command("layer.update", { layerId: id, target })
              }
            />
            <NumberField
              label="Opacity"
              unit="%"
              step={1}
              value={toPercent(layer.opacity)}
              onCommit={(value) =>
                void command("layer.update", {
                  layerId: id,
                  opacity: percent(value),
                })
              }
            />
            <SelectField
              label="Blend mode"
              value={layer.blendMode}
              options={BLEND_MODES.map((mode) => ({
                value: mode,
                label: blendLabels[mode],
              }))}
              onValueChange={(blendMode) => {
                if (blendMode !== null)
                  void command("layer.update", { layerId: id, blendMode });
              }}
            />
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Visual yet: this Layer renders nothing until one is picked.
            </p>
          </>
        )}
        {layer.kind === "filter" && (
          <>
            <NumberField
              label="Mix"
              unit="%"
              step={1}
              value={toPercent(layer.mix)}
              onCommit={(value) =>
                void command("layer.update", {
                  layerId: id,
                  mix: percent(value),
                })
              }
            />
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Filter yet: this Layer passes the frame through until one is
              picked.
            </p>
          </>
        )}
      </div>
    </>
  );
}
