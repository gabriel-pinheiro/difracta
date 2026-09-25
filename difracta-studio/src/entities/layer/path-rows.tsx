import type { DocumentView } from "@difracta/client";
import {
  generateId,
  pathsOf,
  type Path,
  type PathRequirement,
  type Table,
  type VisualLayer,
} from "@difracta/core";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldRow } from "@/inspector/fields/field-row";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useExpansion } from "@/navigator/expansion";
import { useSelection } from "@/selection/selection";

/**
 * One row per Path the Layer's Visual follows, below its Target: a select
 * over the Target's Paths and a "+" that creates one named after the Layer,
 * binds it and selects it. A binding to a Path off the Target shows as None.
 */
export function PathRows({
  view,
  layer,
  requirements,
}: {
  readonly view: DocumentView;
  readonly layer: VisualLayer;
  readonly requirements: readonly PathRequirement[];
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const paths = useDocumentPath<Table<Path>>(view, ["paths"]) ?? {};
  const target = layer.target;
  const candidates =
    target === null ? [] : pathsOf({ masks: {}, paths }, target);
  return (
    <>
      {requirements.map((requirement) => {
        const bound = layer.paths[requirement.key];
        const value =
          bound !== undefined &&
          candidates.some((candidate) => candidate.id === bound)
            ? bound
            : null;
        const createPath = (): void => {
          if (target === null) return;
          const pathId = generateId("path");
          void command("path.create", {
            id: pathId,
            surfaceId: target,
            name: `${layer.name} ${requirement.label}`,
          })
            .then(() =>
              command("layer.path", {
                layerId: layer.id,
                key: requirement.key,
                pathId,
              }),
            )
            .then(() => {
              setExpanded("surface", target, true);
              select({ kind: "path", id: pathId });
            });
        };
        return (
          <FieldRow key={`path:${requirement.key}`} label={requirement.label}>
            <div className="flex w-full min-w-0 items-center gap-1">
              <Select
                value={value}
                items={[
                  { value: null, label: "None" },
                  ...candidates.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  })),
                ]}
                onValueChange={(pathId: string | null) =>
                  void command("layer.path", {
                    layerId: layer.id,
                    key: requirement.key,
                    pathId,
                  })
                }
              >
                <SelectTrigger
                  aria-label={`${requirement.label} Path`}
                  className="min-w-0 flex-1"
                  title={
                    target === null
                      ? "Pick a Target first"
                      : value === null
                        ? `Needs a Path on the Target: ${requirement.description ?? "the Visual follows it"}`
                        : requirement.description
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>
                    {target === null
                      ? "No Target"
                      : candidates.length === 0
                        ? "No Path on the Target"
                        : "None"}
                  </SelectItem>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                disabled={target === null}
                title="New Path on the Target, bound here"
                aria-label={`New ${requirement.label} Path`}
                onClick={createPath}
              >
                <Plus />
              </Button>
            </div>
          </FieldRow>
        );
      })}
    </>
  );
}
