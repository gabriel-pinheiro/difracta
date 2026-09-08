import type { DocumentView } from "@difracta/client";
import type { Installation } from "@difracta/core";

import { InspectorHeading } from "@/inspector/fields/inspector-heading";
import { NameField } from "@/inspector/fields/name-field";
import { useCommand, useDocumentPath } from "@/lib/client";

/** Settings of the Installation itself, shown when its root row is selected. */
export function InstallationInspector({
  view,
}: {
  readonly view: DocumentView;
}) {
  const command = useCommand(view);
  const installation = useDocumentPath<Installation>(view, ["installation"]);
  if (installation === undefined) return null;

  return (
    <>
      <InspectorHeading name={installation.name} id={installation.id} />
      <div className="grid gap-4 p-3">
        <NameField
          label="Name"
          value={installation.name}
          onCommit={(name) => void command("installation.rename", { name })}
        />
      </div>
    </>
  );
}
