import type { DocumentView } from "@difracta/client";
import {
  orderedEntries,
  type Output,
  type Surface,
  type Table,
} from "@difracta/core";
import { Box } from "lucide-react";
import { useEffect } from "react";

import { CopyField } from "@/inspector/fields/copy-field";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { SwitchField } from "@/inspector/fields/switch-field";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { outputPageUrl } from "./output-url";

export function OutputInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const command = useCommand(view);
  const { select } = useSelection();
  const output = useDocumentPath<Output>(view, ["outputs", id]);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]) ?? {};

  // The Output was removed (here or elsewhere): fall back to the Installation.
  useEffect(() => {
    if (output === undefined) select({ kind: "installation" });
  }, [output, select]);
  if (output === undefined) return null;
  const mapped = orderedEntries(surfaces).filter(
    (surface) => surface.output === id,
  );

  return (
    <>
      <InspectorHeading name={output.name} id={output.id} />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={output.name}
          onCommit={(name) =>
            void command("output.rename", { outputId: id, name })
          }
        />
        <CopyField
          label="Output page"
          description="Open this address on the display paired with the Output."
          value={outputPageUrl(id)}
          openHref={outputPageUrl(id)}
        />
        <SwitchField
          label="Limit pixel ratio"
          description="Render at 1× device pixel ratio. Improves performance on weak GPUs such as TVs."
          checked={output.limitPixelRatio}
          onCheckedChange={(limitPixelRatio) =>
            void command("output.update", { outputId: id, limitPixelRatio })
          }
        />
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Surfaces</span>
          {mapped.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              No Surface renders through this Output.
            </p>
          ) : (
            <ul className="grid gap-px">
              {mapped.map((surface) => (
                <li key={surface.id}>
                  <button
                    type="button"
                    className="flex h-6 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => select({ kind: "surface", id: surface.id })}
                  >
                    <Box className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{surface.name}</span>
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
