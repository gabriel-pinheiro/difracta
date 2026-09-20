import { Fragment } from "react";

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

import { BlackoutToggle } from "./blackout-toggle";
import type { MenuItemModel, MenuModel } from "./menu-model";

/** Menus size to their content, not to the trigger, so items and shortcuts stay on one line. */
const menuClass = "w-auto min-w-48 whitespace-nowrap";

/**
 * The in-page application bar, the menu model's renderer in a browser: File
 * and Edit menus, Blackout, the Installation's name and file.
 */
export function MenuBar({
  model,
  onCommand,
}: {
  readonly model: MenuModel;
  readonly onCommand: (id: string) => void;
}) {
  const { selected, view } = useDocumentCommands();
  const name =
    selected === undefined
      ? undefined
      : `${selected.name}${selected.dirty ? "*" : ""}`;

  return (
    <header className="grid h-8 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-sidebar px-1 text-sidebar-foreground">
      <div className="flex items-center gap-1">
        <span className="px-2 text-xs font-semibold tracking-wide select-none">
          Difracta
        </span>
        <Menubar className="h-auto rounded-none border-0 bg-transparent p-0">
          <ModelMenu label="File" items={model.file} onCommand={onCommand} />
          <ModelMenu label="Edit" items={model.edit} onCommand={onCommand} />
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

function ModelMenu({
  label,
  items,
  onCommand,
}: {
  readonly label: string;
  readonly items: readonly MenuItemModel[];
  readonly onCommand: (id: string) => void;
}) {
  return (
    <MenubarMenu>
      <MenubarTrigger>{label}</MenubarTrigger>
      <MenubarContent align="start" className={menuClass}>
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore === true && <MenubarSeparator />}
            <MenubarItem
              disabled={!item.enabled}
              onClick={() => onCommand(item.id)}
            >
              {item.label}
              {item.shortcutLabel !== undefined && (
                <MenubarShortcut>{item.shortcutLabel}</MenubarShortcut>
              )}
            </MenubarItem>
          </Fragment>
        ))}
      </MenubarContent>
    </MenubarMenu>
  );
}
