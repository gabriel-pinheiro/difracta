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
import { useClient, useSignal } from "@/lib/client";
import { shortcuts } from "@/shortcuts";

/** Menus size to their content, not to the trigger, so items and shortcuts stay on one line. */
const menuClass = "w-auto min-w-48 whitespace-nowrap";

/** The application bar: File and Edit menus, the Installation's name, connection state. */
export function MenuBar() {
  const client = useClient();
  const phase = useSignal(client.phase);
  const commands = useDocumentCommands();
  const { selected } = commands;
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
    <header className="flex h-8 shrink-0 items-center gap-1 border-b bg-sidebar px-1 text-sidebar-foreground">
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
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs">
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
      <span
        className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"
        title={connected ? "Connected to the runtime" : `Runtime: ${phase}`}
      >
        <span
          className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
        />
        Difracta
      </span>
    </header>
  );
}
