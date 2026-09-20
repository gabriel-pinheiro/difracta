import { useEffect } from "react";

import { useDocumentCommands } from "@/documents/document-commands";
import { useClient, useSignal } from "@/lib/client";

import { MenuBar } from "./menu-bar";
import { menuModel, runMenuCommand, type MenuModel } from "./menu-model";
import { menuBridge } from "./menu-bridge";
import { useInPageBar } from "./use-in-page-bar";

/**
 * Studio's menu: the model computed once, then drawn by one of two renderers.
 * In a browser that is the in-page bar. In Difracta Desktop the model goes to
 * the native menu bar through `window.difractaMenu`, clicks there come back
 * as ids, and the in-page bar is not rendered; the Installation's name and
 * path, which the bar also shows, are in the window's title there.
 */
export function AppMenu() {
  const client = useClient();
  const connected = useSignal(client.phase) === "connected";
  const commands = useDocumentCommands();
  const { selected, free } = commands;
  const model = menuModel({
    free,
    connected,
    document:
      selected === undefined
        ? undefined
        : { path: selected.path, dirty: selected.dirty },
  });
  // As text, so the effect below runs only when the menu really differs:
  // Desktop rebuilds its native menu on every `setMenu`.
  const serialised = JSON.stringify(model);

  const name =
    selected === undefined
      ? undefined
      : `${selected.name}${selected.dirty ? "*" : ""}`;
  useEffect(() => {
    document.title =
      name === undefined ? "Difracta Studio" : `${name} – Difracta Studio`;
  }, [name]);

  const bridge = menuBridge();
  const inPage = useInPageBar();
  useEffect(() => {
    bridge?.setMenu(JSON.parse(serialised) as MenuModel);
  }, [bridge, serialised]);
  useEffect(
    () => bridge?.onMenuCommand((id) => runMenuCommand(id, commands)),
    [bridge, commands],
  );

  return inPage ? (
    <MenuBar model={model} onCommand={(id) => runMenuCommand(id, commands)} />
  ) : null;
}
