import { Toaster } from "@/components/ui/sonner";
import {
  DocumentCommandsProvider,
  useDocumentCommands,
} from "@/documents/document-commands";
import { ShortcutKeys } from "@/keyboard/shortcut-keys";
import { useClient, useSignal } from "@/lib/client";
import { MenuBar } from "@/menu/menu-bar";
import { StatusStrip } from "@/status/status-strip";
import { Workspace } from "@/workspace/workspace";

export function App() {
  return (
    <DocumentCommandsProvider>
      <div className="flex h-dvh flex-col">
        <MenuBar />
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
  const { view } = useDocumentCommands();
  if (view === undefined) {
    return (
      <main className="grid flex-1 place-items-center text-muted-foreground">
        {phase === "connected"
          ? "Open or create an Installation from the File menu."
          : "Connecting to the runtime…"}
      </main>
    );
  }
  return <Workspace view={view} />;
}
