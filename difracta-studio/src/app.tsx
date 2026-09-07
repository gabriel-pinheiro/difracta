import { Toaster } from "@/components/ui/sonner";
import {
  DocumentCommandsProvider,
  useDocumentCommands,
} from "@/documents/document-commands";
import { InstallationPanel } from "@/installation/installation-panel";
import { ShortcutKeys } from "@/keyboard/shortcut-keys";
import { useClient, useSignal } from "@/lib/client";
import { MenuBar } from "@/menu/menu-bar";
import { OutputsPanel } from "@/outputs/outputs-panel";

export function App() {
  return (
    <DocumentCommandsProvider>
      <div className="flex h-dvh flex-col">
        <MenuBar />
        <Workspace />
      </div>
      <ShortcutKeys />
      <Toaster position="bottom-right" closeButton />
    </DocumentCommandsProvider>
  );
}

function Workspace() {
  const client = useClient();
  const phase = useSignal(client.phase);
  const { selected } = useDocumentCommands();
  const view =
    selected === undefined ? undefined : client.openDocument(selected.id);

  if (view === undefined) {
    return (
      <main className="grid flex-1 place-items-center text-muted-foreground">
        {phase === "connected"
          ? "Open or create an Installation from the File menu."
          : "Connecting to the runtime…"}
      </main>
    );
  }
  return (
    <main className="grid flex-1 grid-cols-[16rem_1fr] gap-px overflow-hidden bg-border">
      <InstallationPanel view={view} />
      <OutputsPanel view={view} />
    </main>
  );
}
