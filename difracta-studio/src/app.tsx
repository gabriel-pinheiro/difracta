import { Toaster } from "@/components/ui/sonner";
import {
  DocumentCommandsProvider,
  useDocumentCommands,
} from "@/documents/document-commands";
import { ShortcutKeys } from "@/keyboard/shortcut-keys";
import { useClient, useSignal } from "@/lib/client";
import { AppMenu } from "@/menu/app-menu";
import { StatusStrip } from "@/status/status-strip";
import { Workspace } from "@/workspace/workspace";

export function App() {
  return (
    <DocumentCommandsProvider>
      <div className="flex h-dvh flex-col">
        <AppMenu />
        <Main />
        <StatusStrip />
      </div>
      <ShortcutKeys />
      <Toaster position="bottom-right" closeButton />
    </DocumentCommandsProvider>
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
