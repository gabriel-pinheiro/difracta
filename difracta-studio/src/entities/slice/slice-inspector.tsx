import type { DocumentView } from "@difracta/client";
import {
  displayOverlaps,
  outputSlices,
  settings,
  SLICE_ROTATIONS,
  type Output,
  type Slice,
  type SliceRect,
  type Surface,
  type Table,
} from "@difracta/core";
import { Box, LayoutPanelTop } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { NumberField } from "@/inspector/fields/number-field";
import { SelectField } from "@/inspector/fields/select-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { pickMappingOutput } from "@/lib/mapping-output";
import { useSelection } from "@/selection/selection";

import { SliceCalibrationControls } from "./slice-calibration";
import { useSliceEditor } from "./slice-editor-state";
import { followersOf, pastDisplay } from "./slice-followers";

const rotations = SLICE_ROTATIONS.map((rotation) => ({
  value: String(rotation),
  label: rotation === 0 ? "None" : `${String(rotation)}° clockwise`,
}));

/**
 * One Slice: its rectangle of the Display Frame and its place in the
 * Projection Frame as exact numbers, the Surfaces following it, its test
 * card and the way into the Slice editor.
 */
export function SliceInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const editor = useSliceEditor();
  const slice = useDocumentPath<Slice>(view, ["slices", id]);
  const output = useDocumentPath<Output>(view, [
    "outputs",
    slice?.outputId ?? "",
  ]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};
  const slices = useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {};

  useEffect(() => {
    if (slice === undefined) select({ kind: "installation" });
  }, [slice, select]);
  if (slice === undefined) return null;
  const update = (fields: Partial<Omit<Slice, "id">>) =>
    void command("slice.update", { sliceId: id, ...fields });
  const rectField = (key: keyof SliceRect, label: string, min: number) => (
    <NumberField
      label={label}
      unit="px"
      decimals={0}
      step={1}
      value={slice.rect[key]}
      onCommit={(value) =>
        update({
          rect: { ...slice.rect, [key]: Math.max(min, Math.round(value)) },
        })
      }
    />
  );
  const followers = followersOf(surfaces, slice);
  const overlapping =
    displayOverlaps(outputSlices(slices, slice.outputId)).get(slice.id) ?? [];

  return (
    <>
      <InspectorHeading name={slice.name} id={slice.id} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-3">
        <NameField
          label="Name"
          value={slice.name}
          onCommit={(name) =>
            void command("slice.rename", { sliceId: id, name })
          }
        />
        <section className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            In the Display Frame
            {output === undefined ? "" : ` of ${output.name}`}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {rectField("x", "X", 0)}
            {rectField("y", "Y", 0)}
            {rectField("width", "Width", 1)}
            {rectField("height", "Height", 1)}
          </div>
          {overlapping.length > 0 && (
            <p className="text-[0.6875rem]/relaxed text-destructive">
              Overlaps {overlapping.map((other) => other.name).join(", ")} in
              the Display Frame; the later Slice shows there.
            </p>
          )}
          {pastDisplay(slice.rect, output?.displaySize ?? null) && (
            <p className="text-[0.6875rem]/relaxed text-amber-400">
              Reaches past the Display Frame; only its part inside is drawn.
            </p>
          )}
        </section>
        <section className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            On stage, in the Projection Frame
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y"] as const).map((key) => (
              <NumberField
                key={key}
                label={key.toUpperCase()}
                unit="px"
                decimals={0}
                step={1}
                value={slice.position[key]}
                onCommit={(value) =>
                  update({
                    position: { ...slice.position, [key]: Math.round(value) },
                  })
                }
              />
            ))}
          </div>
        </section>
        <SelectField
          label="Rotation"
          value={String(slice.rotation)}
          options={rotations}
          onValueChange={(value) => {
            const rotation = SLICE_ROTATIONS.find((r) => String(r) === value);
            if (rotation !== undefined) update({ rotation });
          }}
        />
        <NumberField
          label="Scale"
          unit="×"
          decimals={3}
          step={0.001}
          value={slice.scale}
          onCommit={(value) =>
            update({
              scale: Math.min(
                settings.slices.maxScale,
                Math.max(settings.slices.minScale, value),
              ),
            })
          }
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <span className="text-xs text-muted-foreground">Followed by</span>
          {followers.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Surface follows this Slice. Pick it as a Surface's Position on
              this Output.
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-px">
              {followers.map((surface) => (
                <li key={surface.id}>
                  <button
                    type="button"
                    className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      pickMappingOutput(surface.id, slice.outputId);
                      select({ kind: "surface", id: surface.id });
                    }}
                  >
                    <Box className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{surface.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <SliceCalibrationControls
            view={view}
            outputId={slice.outputId}
            sliceId={slice.id}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => editor.open(slice.outputId)}
          >
            <LayoutPanelTop data-icon="inline-start" /> Edit Slices
          </Button>
        </div>
      </div>
    </>
  );
}
