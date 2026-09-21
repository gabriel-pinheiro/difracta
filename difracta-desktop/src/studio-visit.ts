import { app, type BrowserWindow } from "electron";

import type { ApplicationMenu } from "./application-menu.ts";
import type { QuitGate } from "./quit-gate.ts";
import type { Session } from "./session.ts";

/**
 * Opens a session's Studio window, or returns the one that is open, and
 * settles what closing it means.
 *
 * Usually closing Studio is quitting: without that window Desktop has nothing
 * to show for itself, on macOS too. So the close is turned into a quit, the
 * quit asks its questions (`quit-gate.ts`), and only an agreed quit closes
 * the window.
 *
 * A session started without the Studio window is the exception. There the
 * window is a visit: someone started Difracta again on the mini-PC to look,
 * and closing it leaves everything running as it was before, so nothing is
 * asked. Quitting is File ▸ Quit.
 */
export function openStudioWindow(
  session: Session,
  context: {
    readonly menu: ApplicationMenu;
    readonly quit: QuitGate;
    /** Whether `session` is still the one Desktop is in. */
    readonly isCurrent: () => boolean;
  },
): BrowserWindow {
  const { menu, quit, isCurrent } = context;
  if (session.window !== undefined) return session.window;

  const window = session.showWindow(() => {
    if (quit.agreed || session.withoutStudio) return true;
    app.quit();
    return false;
  });
  window.on("closed", () => {
    // Switching ends the session first, and takes care of the menu itself.
    if (!isCurrent()) return;
    if (session.withoutStudio && !quit.agreed) menu.setStudio(undefined);
    else app.quit();
  });
  menu.setStudio({
    window,
    origin: session.origin,
    local: session.bridgeOrigin !== undefined,
  });
  return window;
}
