import type { DocumentView } from "@difracta/client";
import type { Output } from "@difracta/core";
import { useEffect } from "react";
import { toast } from "sonner";

import { CopyField } from "@/inspector/fields/copy-field";
import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { SwitchField } from "@/inspector/fields/switch-field";
import { useClient, useDocumentPath } from "@/lib/client";
import { useSelection } from "@/selection/selection";

import { outputPageUrl } from "./output-url";

export function OutputInspector({
  view,
  id,
}: {
  readonly view: DocumentView;
  readonly id: string;
}) {
  const client = useClient();
  const { select } = useSelection();
  const output = useDocumentPath<Output>(view, ["outputs", id]);

  // The Output was removed (here or elsewhere): fall back to the Installation.
  useEffect(() => {
    if (output === undefined) select({ kind: "installation" });
  }, [output, select]);
  if (output === undefined) return null;

  function run(name: string, payload: unknown): void {
    void client
      .command(view.documentId, name, payload)
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
  }

  return (
    <>
      <InspectorHeading name={output.name} id={output.id} type="Output" />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={output.name}
          onCommit={(name) => run("output.rename", { outputId: id, name })}
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
            run("output.update", { outputId: id, limitPixelRatio })
          }
        />
      </div>
    </>
  );
}
