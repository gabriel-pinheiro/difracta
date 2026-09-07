import type { DocumentView } from "@difracta/client";
import type { Output, OutputId, Table } from "@difracta/core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { NameField } from "@/components/name-field";
import { useClient, useDocumentPath } from "@/lib/client";

export function OutputsPanel({ view }: { readonly view: DocumentView }) {
  const client = useClient();
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const [error, setError] = useState<string | undefined>(undefined);

  function run(name: string, payload: unknown): void {
    setError(undefined);
    void client
      .command(view.documentId, name, payload)
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      });
  }

  function create(): void {
    const name = prompt(
      "Output name",
      `Output ${Object.keys(outputs).length + 1}`,
    );
    if (name !== null && name.trim() !== "") run("output.create", { name });
  }

  return (
    <section className="flex flex-col gap-3 bg-background p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Outputs
        </h2>
        <Button size="sm" variant="secondary" onClick={create}>
          Add Output
        </Button>
      </div>
      {error !== undefined && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {Object.keys(outputs).length === 0 && (
        <p className="text-muted-foreground">
          No Outputs yet. Each Output pairs with one display through the Output
          page.
        </p>
      )}
      <ul className="grid gap-2">
        {Object.values(outputs).map((output) => (
          <OutputRow
            key={output.id}
            view={view}
            outputId={output.id}
            onRun={run}
          />
        ))}
      </ul>
    </section>
  );
}

function OutputRow({
  view,
  outputId,
  onRun,
}: {
  readonly view: DocumentView;
  readonly outputId: OutputId;
  readonly onRun: (name: string, payload: unknown) => void;
}) {
  const name =
    useDocumentPath<string>(view, ["outputs", outputId, "name"]) ?? "";
  const outputUrl = `${location.origin}/output/?output=${encodeURIComponent(outputId)}`;
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-end gap-2 rounded-md border p-2">
      <NameField
        label="Name"
        value={name}
        onCommit={(next) => onRun("output.rename", { outputId, name: next })}
      />
      <Button
        size="sm"
        variant="ghost"
        render={<a href={outputUrl} target="_blank" rel="noreferrer" />}
      >
        Open page
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onRun("output.remove", { outputId })}
      >
        Remove
      </Button>
    </li>
  );
}
