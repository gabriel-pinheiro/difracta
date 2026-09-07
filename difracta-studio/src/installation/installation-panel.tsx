import type { DocumentView } from "@difracta/client";

import { Button } from "@/components/ui/button";
import { useClient, useDocumentPath } from "@/lib/client";

import { NameField } from "@/components/name-field";

export function InstallationPanel({ view }: { readonly view: DocumentView }) {
  const client = useClient();
  const name = useDocumentPath<string>(view, ["installation", "name"]) ?? "";
  const blackout =
    useDocumentPath<boolean>(view, ["operational", "blackout"]) ?? false;

  return (
    <aside className="flex flex-col gap-4 bg-background p-3">
      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Installation
        </h2>
        <NameField
          label="Name"
          value={name}
          onCommit={(next) =>
            void client
              .command(view.documentId, "installation.rename", { name: next })
              .catch(() => undefined)
          }
        />
      </section>
      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Performance
        </h2>
        <Button
          variant={blackout ? "destructive" : "secondary"}
          className="w-full"
          onClick={() =>
            client.input(view.documentId, "installation/blackout", !blackout)
          }
        >
          {blackout ? "Blackout on" : "Blackout off"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Written through the input channel to{" "}
          <code>installation/blackout</code>; not undoable.
        </p>
      </section>
    </aside>
  );
}
