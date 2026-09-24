import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import {
  DocumentCommandsProvider,
  useDocumentCommands,
} from "@/documents/document-commands";
import { ShortcutKeys } from "@/keyboard/shortcut-keys";
import { useClient, useSignal } from "@/lib/client";
import { AppMenu } from "@/menu/app-menu";
import { SelectionProvider } from "@/selection/selection";
import { StatusStrip } from "@/status/status-strip";
import { Workspace } from "@/workspace/workspace";

export function App() {
  return (
    <DocumentCommandsProvider>
      <DocumentSelection>
        <div className="flex h-dvh flex-col">
          <AppMenu />
          <Main />
          <StatusStrip />
        </div>
        <ShortcutKeys />
      </DocumentSelection>
      <Toaster position="bottom-right" closeButton />
    </DocumentCommandsProvider>
  );
}

/** The selection, above the menu and the shortcuts that remove it; empty for each document. */
function DocumentSelection({ children }: { readonly children: ReactNode }) {
  const { view } = useDocumentCommands();
  return (
    <SelectionProvider documentId={view?.documentId}>
      {children}
    </SelectionProvider>
  );
}

function Main() {
  const client = useClient();
  const phase = useSignal(client.phase);
  const { view, free } = useDocumentCommands();
  if (view === undefined) {
    return (
      <main className="grid flex-1 place-items-center text-muted-foreground">
        {phase !== "connected"
          ? "Connecting to the runtime…"
          : free
            ? "Open or create an Installation from the File menu."
            : "The runtime has no Installation open."}
      </main>
    );
  }
  return <Workspace view={view} />;
}
