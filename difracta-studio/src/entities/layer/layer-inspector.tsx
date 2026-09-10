import type { DocumentView } from "@difracta/client";
import {
  BLEND_MODES,
  orderedEntries,
  type BlendMode,
  type Layer,
  type Surface,
  type Table,
} from "@difracta/core";
import { useEffect } from "react";

import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { fromPercent, toPercent } from "@/inspector/fields/points";
import { SelectField } from "@/inspector/fields/select-field";
import { SliderField } from "@/inspector/fields/slider-field";
import { SwitchField } from "@/inspector/fields/switch-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { DefinitionBlock } from "./definition-block";

const blendLabels: Record<BlendMode, string> = {
  normal: "Normal",
  additive: "Additive",
};

/** What the Layer is made of, then its name, enabled state and the fields of its kind. */
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
        {layer.kind !== "group" && <DefinitionBlock layer={layer} />}
        <NameField
          label="Name"
          value={layer.name}
          onCommit={(name) =>
            void command("layer.rename", { layerId: id, name })
          }
        />
        <SwitchField
          label="Enabled"
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
                label: surface.name,
              }))}
              onValueChange={(target) =>
                void command("layer.update", { layerId: id, target })
              }
            />
            <SliderField
              label="Opacity"
              unit="%"
              value={toPercent(layer.opacity)}
              onChange={(value) =>
                command("layer.update", {
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
          </>
        )}
        {layer.kind === "filter" && (
          <SliderField
            label="Mix"
            unit="%"
            value={toPercent(layer.mix)}
            onChange={(value) =>
              command("layer.update", { layerId: id, mix: percent(value) })
            }
          />
        )}
      </div>
    </>
  );
}
