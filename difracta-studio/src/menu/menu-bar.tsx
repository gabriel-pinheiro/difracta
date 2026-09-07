import type { DocumentView } from "@difracta/client";
import { useEffect } from "react";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useDocumentCommands } from "@/documents/document-commands";
import { useClient, useDocumentPath, useSignal } from "@/lib/client";
import { cn } from "@/lib/utils";
import { shortcuts } from "@/shortcuts";

/** Menus size to their content, not to the trigger, so items and shortcuts stay on one line. */
const menuClass = "w-auto min-w-48 whitespace-nowrap";

/** The application bar: File and Edit menus, Blackout, the Installation's name. */
export function MenuBar() {
  const client = useClient();
  const phase = useSignal(client.phase);
  const commands = useDocumentCommands();
  const { selected, view } = commands;
  const connected = phase === "connected";
  const canRevert =
    (selected?.path ?? null) !== null && selected?.dirty === true;
  const name =
    selected === undefined
      ? undefined
      : `${selected.name}${selected.dirty ? "*" : ""}`;

  useEffect(() => {
    document.title =
      name === undefined ? "Difracta Studio" : `${name} – Difracta Studio`;
  }, [name]);

  return (
    <header className="grid h-8 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-sidebar px-1 text-sidebar-foreground">
      <div className="flex items-center gap-1">
        <span className="px-2 text-xs font-semibold tracking-wide select-none">
          Difracta
        </span>
        <Menubar className="h-auto rounded-none border-0 bg-transparent p-0">
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent align="start" className={menuClass}>
              <MenubarItem disabled={!connected} onClick={commands.create}>
                New Installation…
              </MenubarItem>
              <MenubarItem disabled={!connected} onClick={commands.open}>
                Open Installation…
                <MenubarShortcut>{shortcuts.open.label}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={selected === undefined}
                onClick={commands.save}
              >
                Save
                <MenubarShortcut>{shortcuts.save.label}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={selected === undefined}
                onClick={commands.saveAs}
              >
                Save As…
                <MenubarShortcut>{shortcuts.saveAs.label}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canRevert} onClick={commands.revert}>
                Revert to Saved
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={selected === undefined}
                onClick={commands.close}
              >
                Close Installation
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent align="start" className={menuClass}>
              <MenubarItem
                disabled={selected === undefined}
                onClick={commands.undo}
              >
                Undo
                <MenubarShortcut>{shortcuts.undo.label}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={selected === undefined}
                onClick={commands.redo}
              >
                Redo
                <MenubarShortcut>{shortcuts.redo.label}</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        {view !== undefined && <BlackoutToggle view={view} />}
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2 text-xs">
        {selected === undefined ? (
          <span className="text-muted-foreground">No Installation open</span>
        ) : (
          <>
            <span className="truncate font-semibold">{name}</span>
            {selected.path !== null && (
              <span
                className="hidden max-w-80 truncate text-muted-foreground md:inline"
                title={selected.path}
              >
                {selected.path}
              </span>
            )}
          </>
        )}
      </div>
    </header>
  );
}

/** Performance control, always in reach: written through the input channel, not undoable. */
function BlackoutToggle({ view }: { readonly view: DocumentView }) {
  const client = useClient();
  const blackout =
    useDocumentPath<boolean>(view, ["operational", "blackout"]) ?? false;
  return (
    <button
      type="button"
      aria-pressed={blackout}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium",
        blackout
          ? "bg-destructive text-white hover:bg-destructive/90"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      onClick={() =>
        client.input(view.documentId, "installation/blackout", !blackout)
      }
    >
      Blackout
    </button>
  );
}
